// Tauri thin-shell POC core (T-087). Contract: windowed TreeEntry paging
// (spike §7.1 of .agents/doc/2026-10-02-native-shell-spike.md) — never the
// whole tree over IPC. Bench commands exist only to turn the spike's ASSUMED
// numbers into MEASURED ones (§9).
//
// Commands live in `mod commands` deliberately: `#[tauri::command]` at crate
// root fails to compile on rustc 1.99 (E0255, hidden macro reimported), while
// the same commands inside a module compile clean.
use serde::Serialize;
use std::ffi::{c_void, CString};
use std::path::Path;
use std::time::Instant;

pub mod commands {
  use super::*;
  use serde::Serialize;
  use std::time::Instant;

  /// Wire type: matches the TS `TreeEntry` subset this RPC returns
  /// (src/lib/fewer/types.ts). `children` is never inlined — paging is the point.
  #[derive(Serialize, Clone)]
  pub struct TreeEntry {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: &'static str, // "folder" | "file" (EntryType)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
  }

  #[derive(Serialize)]
  #[serde(rename_all = "camelCase")]
  pub struct DirPage {
    pub entries: Vec<TreeEntry>,
    pub total: usize,
  }

  #[tauri::command]
  pub fn list_dir(path: String, offset: usize, limit: usize) -> Result<DirPage, String> {
    let mut entries: Vec<TreeEntry> = Vec::new();
    for entry in std::fs::read_dir(&path).map_err(|e| format!("{path}: {e}"))? {
      let entry = entry.map_err(|e| e.to_string())?;
      let md = entry.metadata().map_err(|e| e.to_string())?;
      entries.push(TreeEntry {
        name: entry.file_name().to_string_lossy().into_owned(),
        kind: if md.is_dir() { "folder" } else { "file" },
        size: if md.is_file() { Some(md.len()) } else { None },
      });
    }
    // Case-insensitive name sort, matching the app's folder-import ordering.
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    let total = entries.len();
    Ok(DirPage { entries: entries.into_iter().skip(offset).take(limit).collect(), total })
  }

  // ---- IPC bench: 100k-node tree, JSON vs raw bytes (spike §2.2 / §9) ----

  fn synth_entries(n: usize) -> Vec<TreeEntry> {
    (0..n)
      .map(|i| TreeEntry {
        name: format!("node_with_a_reasonably_long_path_component_{i:07}"),
        kind: if i % 10 == 0 { "folder" } else { "file" },
        size: Some(i as u64 * 13),
      })
      .collect()
  }

  #[derive(Serialize)]
  #[serde(rename_all = "camelCase")]
  pub struct TreeJsonBench {
    pub json: String,
    pub serialize_ms: f64,
    pub json_bytes: usize,
  }

  #[tauri::command]
  pub fn bench_tree_json(n: usize) -> TreeJsonBench {
    let entries = synth_entries(n);
    let t = Instant::now();
    let json = serde_json::to_string(&entries).expect("serialize");
    TreeJsonBench { serialize_ms: t.elapsed().as_secs_f64() * 1e3, json_bytes: json.len(), json }
  }

  #[derive(Serialize)]
  #[serde(rename_all = "camelCase")]
  pub struct RawBenchMeta {
    pub encode_ms: f64,
    pub raw_bytes: usize,
  }

  #[tauri::command]
  pub fn bench_tree_raw_meta(n: usize) -> RawBenchMeta {
    let entries = synth_entries(n);
    let t = Instant::now();
    let raw = encode_raw(&entries);
    RawBenchMeta { encode_ms: t.elapsed().as_secs_f64() * 1e3, raw_bytes: raw.len() }
  }

  /// Deliberately dumb compact layout — the POC compares JSON against *a*
  /// compact binary, not a fancied-up format: per entry u32 name_len, name
  /// bytes, u8 kind (1 = folder), u64 size.
  fn encode_raw(entries: &[TreeEntry]) -> Vec<u8> {
    let mut out = Vec::with_capacity(entries.len() * 56);
    for e in entries {
      let name = e.name.as_bytes();
      out.extend_from_slice(&(name.len() as u32).to_le_bytes());
      out.extend_from_slice(name);
      out.push(if e.kind == "folder" { 1 } else { 0 });
      out.extend_from_slice(&e.size.unwrap_or(0).to_le_bytes());
    }
    out
  }

  /// Raw-bytes IPC path: `tauri::ipc::Response` hands the webview an
  /// ArrayBuffer instead of a JSON array of numbers.
  #[tauri::command]
  pub fn bench_tree_raw(n: usize) -> tauri::ipc::Response {
    tauri::ipc::Response::new(encode_raw(&synth_entries(n)))
  }

  // ---- Walk throughput on a deep real tree (spike §9) ----

  #[derive(Serialize)]
  #[serde(rename_all = "camelCase")]
  pub struct WalkBench {
    pub entries: usize,
    pub dirs: usize,
    pub elapsed_ms: f64,
    pub entries_per_sec: f64,
  }

  #[tauri::command]
  pub fn bench_walk(path: String) -> Result<WalkBench, String> {
    let t = Instant::now();
    let mut entries = 0usize;
    let mut dirs = 0usize;
    let mut stack = vec![Path::new(&path).to_path_buf()];
    while let Some(dir) = stack.pop() {
      let rd = match std::fs::read_dir(&dir) { Ok(rd) => rd, Err(_) => continue };
      for entry in rd.flatten() {
        entries += 1;
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
          dirs += 1;
          stack.push(entry.path());
        }
      }
    }
    let elapsed = t.elapsed().as_secs_f64();
    Ok(WalkBench {
      entries,
      dirs,
      elapsed_ms: elapsed * 1e3,
      entries_per_sec: if elapsed > 0.0 { entries as f64 / elapsed } else { 0.0 },
    })
  }

  // ---- OS opener (replaces /api/open-folder + /api/open-file in the shell) ----

  #[tauri::command]
  pub fn open_in_os(path: String) -> Result<(), String> {
    use std::process::Command;
    let target = Path::new(&path);
    let shown = target.display().to_string();
    let (prog, args): (&str, Vec<String>) = if cfg!(target_os = "macos") {
      ("open", vec![shown])
    } else if cfg!(target_os = "windows") {
      ("cmd", vec!["/c".into(), "start".into(), "".into(), shown])
    } else {
      ("xdg-open", vec![shown])
    };
    Command::new(prog).args(&args).spawn().map(|_| ()).map_err(|e| format!("{prog}: {e}"))
  }

  // ---- Local library FS (T-089): text-file ops for the Fewer Library dir ----

  #[tauri::command]
  pub fn fs_read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
  }

  #[tauri::command]
  pub fn fs_write_text(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
      std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    std::fs::write(&path, contents).map_err(|e| format!("{path}: {e}"))
  }

  #[tauri::command]
  pub fn fs_remove_file(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| format!("{path}: {e}"))
  }

  /// Native folder picker for the library location. Commands run off the main
  /// thread, so the dialog plugin's blocking API is safe here.
  #[tauri::command]
  pub fn pick_library_dir(app: tauri::AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    app.dialog()
      .file()
      .blocking_pick_folder()
      .map(|p| p.to_string())
  }
}

// ---- Native libarchive listing (the wasm O(FILE) competitor) ----

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveBench {
  pub entries: usize,
  pub dirs: usize,
  pub files: usize,
  pub uncompressed_bytes: u64,
  pub elapsed_ms: f64,
  pub peak_rss_kb: u64,
}

fn peak_rss_kb() -> u64 {
  std::fs::read_to_string("/proc/self/status")
    .ok()
    .and_then(|s| {
      s.lines()
        .find(|l| l.starts_with("VmHWM:"))
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|v| v.parse().ok())
    })
    .unwrap_or(0)
}

#[link(name = "archive")]
unsafe extern "C" {
  fn archive_read_new() -> *mut c_void;
  fn archive_read_support_filter_all(a: *mut c_void) -> i32;
  fn archive_read_support_format_all(a: *mut c_void) -> i32;
  fn archive_read_open_filename(a: *mut c_void, f: *const i8, block: usize) -> i32;
  fn archive_read_next_header(a: *mut c_void, e: *mut *mut c_void) -> i32;
  fn archive_read_data_skip(a: *mut c_void) -> i32;
  fn archive_read_free(a: *mut c_void) -> i32;
  fn archive_entry_size(e: *mut c_void) -> i64;
  fn archive_entry_filetype(e: *mut c_void) -> u32;
  fn archive_error_string(a: *mut c_void) -> *const i8;
}

const ARCHIVE_EOF: i32 = 1;
const ARCHIVE_FAILED: i32 = -25;
const AE_IFDIR: u32 = 0o040000;

fn err_str(a: *mut c_void) -> String {
  let p = unsafe { archive_error_string(a) };
  if p.is_null() {
    return "unknown".into();
  }
  unsafe { std::ffi::CStr::from_ptr(p).to_string_lossy().into_owned() }
}

/// List an archive via native libarchive through an FD (seekable, bounded
/// memory) — the competitor to the wasm engine's O(FILE) MEMFS copy. Data is
/// skipped, not read: this measures listing cost (getFilesObject parity).
pub fn bench_archive(path: &str) -> Result<ArchiveBench, String> {
  unsafe {
    let a = archive_read_new();
    if a.is_null() {
      return Err("archive_read_new failed".into());
    }
    if archive_read_support_filter_all(a) != 0 || archive_read_support_format_all(a) != 0 {
      let msg = err_str(a);
      archive_read_free(a);
      return Err(format!("support setup: {msg}"));
    }
    let cpath = CString::new(path).map_err(|e| e.to_string())?;
    if archive_read_open_filename(a, cpath.as_ptr(), 10240) != 0 {
      let msg = err_str(a);
      archive_read_free(a);
      return Err(format!("open {path}: {msg}"));
    }
    let t = Instant::now();
    let (mut entries, mut dirs, mut files, mut bytes) = (0usize, 0usize, 0usize, 0u64);
    let mut entry: *mut c_void = std::ptr::null_mut();
    loop {
      let r = archive_read_next_header(a, &mut entry);
      if r == ARCHIVE_EOF {
        break;
      }
      if r == 0 {
        entries += 1;
        if archive_entry_filetype(entry) & AE_IFDIR != 0 {
          dirs += 1;
        } else {
          files += 1;
        }
        let sz = archive_entry_size(entry);
        if sz > 0 {
          bytes += sz as u64;
        }
      } else if r <= ARCHIVE_FAILED {
        let msg = err_str(a);
        archive_read_free(a);
        return Err(format!("next_header: {msg}"));
      }
      archive_read_data_skip(a);
    }
    let elapsed_ms = t.elapsed().as_secs_f64() * 1e3;
    archive_read_free(a);
    Ok(ArchiveBench { entries, dirs, files, uncompressed_bytes: bytes, elapsed_ms, peak_rss_kb: peak_rss_kb() })
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::list_dir,
      commands::bench_tree_json,
      commands::bench_tree_raw_meta,
      commands::bench_tree_raw,
      commands::bench_walk,
      commands::open_in_os
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
