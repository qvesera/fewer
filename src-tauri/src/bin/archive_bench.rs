// Headless listing/RSS bench for the native archive reader (T-087 POC) —
// spike §9 number 1: native peak RSS vs the wasm engine's O(FILE) MEMFS copy.
// Usage: cargo run --release --bin archive_bench <archive> [more...]
fn main() {
  let args: Vec<String> = std::env::args().skip(1).collect();
  if args.is_empty() {
    eprintln!("usage: archive_bench <archive> [...]");
    std::process::exit(2);
  }
  for path in &args {
    match app_lib::bench_archive(path) {
      Ok(b) => println!(
        "{} entries={} dirs={} files={} uncompressed_bytes={} elapsed_ms={:.1} entries_per_sec={:.0} peak_rss_kb={}",
        path,
        b.entries,
        b.dirs,
        b.files,
        b.uncompressed_bytes,
        b.elapsed_ms,
        if b.elapsed_ms > 0.0 { b.entries as f64 / (b.elapsed_ms / 1e3) } else { 0.0 },
        b.peak_rss_kb
      ),
      Err(e) => println!("{path} ERROR {e}"),
    }
  }
}
