/**
 * Copy libarchive.js's web worker and wasm into public/libarchive/ so the app
 * can fetch them at runtime.
 *
 * The browser build of libarchive.js defaults its worker to
 * `new URL("./worker-bundle.js", import.meta.url)`, which does not survive
 * bundling — the worker and its wasm must be served as static files instead.
 * Running this before dev/build (and before standalone copies public/) keeps
 * the served path stable at /libarchive/.
 *
 * The files are generated from node_modules and gitignored, so the repo never
 * carries a 1 MB binary blob.
 */
import { mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "libarchive.js", "dist");
const dest = join(root, "public", "libarchive");

const files = ["worker-bundle.js", "libarchive.wasm"];

await mkdir(dest, { recursive: true });
await Promise.all(files.map((f) => copyFile(join(src, f), join(dest, f))));
console.log(`vendor: copied ${files.join(", ")} to public/libarchive/`);