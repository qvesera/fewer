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
    /// Present when the entry is a symlink: raw target + broken flag. The
    /// honest folder/file kind above already FOLLOWS the link.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symlink: Option<SymlinkWire>,
  }

  #[derive(Serialize, Clone)]
  pub struct SymlinkWire {
    pub target: String,
    pub broken: bool,
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
      let name = entry.file_name().to_string_lossy().into_owned();
      let entry_path = Path::new(&path).join(&name);
      let ftype = entry.file_type().map_err(|e| e.to_string())?;
      if ftype.is_symlink() {
        // lstat-style: file_type says "link"; follow for the honest kind/size.
        let target = std::fs::read_link(&entry_path)
          .map(|p| p.display().to_string())
          .unwrap_or_default();
        match std::fs::metadata(&entry_path) {
          Ok(md) => entries.push(TreeEntry {
            name,
            kind: if md.is_dir() { "folder" } else { "file" },
            size: if md.is_file() { Some(md.len()) } else { None },
            symlink: Some(SymlinkWire { target, broken: false }),
          }),
          Err(_) => entries.push(TreeEntry {
            name,
            kind: "file",
            size: Some(0),
            symlink: Some(SymlinkWire { target, broken: true }),
          }),
        }
        continue;
      }
      let md = entry.metadata().map_err(|e| e.to_string())?;
      entries.push(TreeEntry {
        name,
        kind: if md.is_dir() { "folder" } else { "file" },
        size: if md.is_file() { Some(md.len()) } else { None },
        symlink: None,
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
        symlink: None,
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

  /// Read a file as raw bytes for the preview panel. Refuses files larger
  /// than `max_bytes` so a huge PDF can't stall the webview IPC.
  #[tauri::command]
  pub fn fs_read_bytes(path: String, max_bytes: u64) -> Result<tauri::ipc::Response, String> {
    let md = std::fs::metadata(&path).map_err(|e| format!("{path}: {e}"))?;
    if md.len() > max_bytes {
      return Err(format!("file too large: {} bytes (cap {max_bytes})", md.len()));
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
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

  // ---- License gate (T-090): offline Ed25519 verification -----------------

  /// Dev public key (raw 32 bytes, hex). The PRIVATE key never ships — it
  /// lives outside the repo (scripts/sign-license.ts --gen-key). Rotating:
  /// generate a new keypair, replace this const, rebuild.
  const LICENSE_PUBLIC_KEY_HEX: &str =
    "c9b138300462d3c778916de3e0ad7680f656f90564cf7e328361535dc894f9b2";

  fn hex_decode(s: &str) -> Option<Vec<u8>> {
    (0..s.len())
      .step_by(2)
      .map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok())
      .collect()
  }

  /// Verify a license signature over the exact payload bytes (base64 sig
  /// arrives decoded as bytes by the JS side). Pure offline check.
  #[tauri::command]
  pub fn verify_license_sig(payload: String, sig: Vec<u8>) -> Result<(), String> {
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    let pk = hex_decode(LICENSE_PUBLIC_KEY_HEX).ok_or("bad public key constant")?;
    let pk: [u8; 32] = pk.try_into().map_err(|_| "bad public key length")?;
    let key = VerifyingKey::from_bytes(&pk).map_err(|e| format!("key: {e}"))?;
    let sig: [u8; 64] = sig.try_into().map_err(|_| "bad signature length")?;
    key.verify(payload.as_bytes(), &Signature::from_bytes(&sig))
      .map_err(|_| "signature invalid".to_string())
  }

  /// Native single-file picker for license activation.
  #[tauri::command]
  pub fn pick_license_file(app: tauri::AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    app.dialog()
      .file()
      .add_filter("Fewer license", &["fewerlicense", "json"])
      .blocking_pick_file()
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
      commands::open_in_os,
      commands::fs_read_text,
      commands::fs_write_text,
      commands::fs_remove_file,
      commands::fs_read_bytes,
      commands::pick_library_dir,
      commands::verify_license_sig,
      commands::pick_license_file
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}

#[cfg(test)]
mod license_tests {
  use super::commands::verify_license_sig;

  // Fixture signed by scripts/sign-license.ts with the dev key (public key
  // pinned in LICENSE_PUBLIC_KEY_HEX). Proves the Rust verifier accepts a
  // real signature end-to-end without a webview.
  const PAYLOAD: &str = r#"{"format":1,"id":"lic_murju3ld_b2dczg","holder":"Fixture Holder","kind":"pro","expires":null,"features":null,"issued_at":"2026-10-02T22:43:03.985Z"}"#;
  const SIG_B64: &str = "cG3zsMn52VpHFroDLuFT8bmbjTOfwCB3tULGYWAwigNnQblbLVw/lUSg9MJp61YhCLQ4qZGY0k0K4Z9iczeiBQ==";

  fn b64_decode(s: &str) -> Vec<u8> {
    // minimal standard-base64 decoder for the test only
    const TBL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0u32;
    for c in s.bytes() {
      if c == b'=' { break; }
      let v = TBL.iter().position(|&t| t == c).expect("b64 char") as u32;
      buf = (buf << 6) | v;
      bits += 6;
      if bits >= 8 {
        bits -= 8;
        out.push((buf >> bits) as u8);
      }
    }
    out
  }

  #[test]
  fn verifies_real_dev_key_signature() {
    let sig = b64_decode(SIG_B64);
    assert_eq!(sig.len(), 64);
    verify_license_sig(PAYLOAD.to_string(), sig).expect("fixture signature must verify");
  }

  #[test]
  fn rejects_tampered_payload() {
    let sig = b64_decode(SIG_B64);
    let tampered = PAYLOAD.replace("Fixture Holder", "Evil Corp");
    assert!(verify_license_sig(tampered, sig).is_err());
  }

  #[test]
  fn rejects_wrong_signature_length() {
    assert!(verify_license_sig(PAYLOAD.to_string(), vec![0u8; 32]).is_err());
  }
}
