// Wasm-engine RSS bench (T-087 POC): peak RSS of libarchive.js on the same
// worst real archive the native bench runs. Listing only (getFilesObject),
// matching the app's look-inside-archives path. Worker threads share the
// process, so /proc VmHWM is process-wide.
// Usage: bun src-tauri/poc/wasm-rss.ts <archive>
import { Archive } from "libarchive.js";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

const path = process.argv[2];
if (!path) {
  console.error("usage: bun src-tauri/poc/wasm-rss.ts <archive>");
  process.exit(2);
}

function peakRssKb(): number {
  const st = readFileSync("/proc/self/status", "utf8");
  const m = st.match(/VmHWM:\s+(\d+)/);
  return m ? Number(m[1]) : 0;
}

type EngineNode = { _name?: string; type?: string; [k: string]: EngineNode | string | number | undefined };
/** Count archive members; nodes carry `_name`, File payloads are never recursed into. */
function countEntries(node: EngineNode): number {
  let n = 0;
  for (const v of Object.values(node)) {
    if (v && typeof v === "object" && "_name" in v) n += 1;
    else if (
      v &&
      typeof v === "object" &&
      (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)
    ) {
      n += countEntries(v);
    }
  }
  return n;
}

const data = await readFile(path);
const file = new File([data], path.split("/").pop() ?? "archive");
const t0 = performance.now();
const arc = await Archive.open(file);
const openMs = performance.now() - t0;
const t1 = performance.now();
const tree = (await arc.getFilesObject()) as unknown as EngineNode;
const listMs = performance.now() - t1;
console.log(JSON.stringify({
  path,
  archive_bytes: data.byteLength,
  open_ms: +openMs.toFixed(1),
  list_ms: +listMs.toFixed(1),
  entries: countEntries(tree),
  peak_rss_kb: peakRssKb(),
}));
process.exit(0); // the engine's worker keeps the event loop alive otherwise
