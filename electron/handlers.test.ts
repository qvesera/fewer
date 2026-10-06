// T-095: Electron host handlers — the Node side of the seam contract.
// Runs under `bun test electron` (pure Node; no electron import by design).

import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createDispatch,
  createHostHandlers,
  fsReadBytes,
  listDir,
  verifyLicenseSig,
} from "./handlers";

// Fixture signed by scripts/sign-license.ts with the dev key — same bytes the
// Rust verifier tests use (src-tauri/src/lib.rs license_tests), proving both
// hosts accept the SAME signature over the SAME payload.
const PAYLOAD =
  '{"format":1,"id":"lic_murju3ld_b2dczg","holder":"Fixture Holder","kind":"pro","expires":null,"features":null,"issued_at":"2026-10-02T22:43:03.985Z"}';
const SIG_B64 = "cG3zsMn52VpHFroDLuFT8bmbjTOfwCB3tULGYWAwigNnQblbLVw/lUSg9MJp61YhCLQ4qZGY0k0K4Z9iczeiBQ==";

const tmpDirs: string[] = [];
async function tmpDir(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), "fewer-electron-test-"));
  tmpDirs.push(d);
  return d;
}
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("verify_license_sig", () => {
  test("accepts the shared cross-host fixture", () => {
    expect(() => verifyLicenseSig(PAYLOAD, Buffer.from(SIG_B64, "base64"))).not.toThrow();
  });

  test("rejects a tampered payload", () => {
    const tampered = PAYLOAD.replace("Fixture Holder", "Evil Corp");
    expect(() => verifyLicenseSig(tampered, Buffer.from(SIG_B64, "base64"))).toThrow();
  });

  test("rejects a wrong-length signature", () => {
    expect(() => verifyLicenseSig(PAYLOAD, new Uint8Array(32))).toThrow(/length/);
  });
});

describe("list_dir", () => {
  test("pages, sorts case-insensitively, and wires symlinks honestly", async () => {
    const dir = await tmpDir();
    await fs.writeFile(path.join(dir, "beta.txt"), "b");
    await fs.writeFile(path.join(dir, "Alpha.txt"), "a");
    await fs.mkdir(path.join(dir, "Gamma"));
    await fs.symlink(path.join(dir, "beta.txt"), path.join(dir, "link-to-beta"));
    await fs.symlink(path.join(dir, "missing-target"), path.join(dir, "broken-link"));

    const all = await listDir(dir, 0, 100);
    expect(all.total).toBe(5);
    expect(all.entries.map((e) => e.name)).toEqual([
      "Alpha.txt",
      "beta.txt",
      "broken-link",
      "Gamma",
      "link-to-beta",
    ]);
    const link = all.entries.find((e) => e.name === "link-to-beta")!;
    expect(link.symlink).toEqual({ target: path.join(dir, "beta.txt"), broken: false });
    expect(link.type).toBe("file"); // honest kind FOLLOWS the link
    const broken = all.entries.find((e) => e.name === "broken-link")!;
    expect(broken.symlink?.broken).toBe(true);

    const page = await listDir(dir, 1, 2);
    expect(page.total).toBe(5);
    expect(page.entries.map((e) => e.name)).toEqual(["beta.txt", "broken-link"]);
  });
});

describe("fs ops", () => {
  test("read_bytes respects the size cap; remove deletes", async () => {
    const dir = await tmpDir();
    const file = path.join(dir, "g.json");
    await fs.writeFile(file, "hello bytes", "utf8");

    expect(await fsReadBytes(file, 1024)).toEqual(new TextEncoder().encode("hello bytes").buffer);
    await expect(fsReadBytes(file, 3)).rejects.toThrow(/too large/);

    await fs.rm(file);
    await expect(fs.readFile(file)).rejects.toThrow();
  });
});

describe("dispatch", () => {
  test("routes pick_library_dir to the injected dialog", async () => {
    const seen: string[] = [];
    const dispatch = createDispatch({
      dialogs: {
        pickDirectory: async () => {
          seen.push("dir");
          return "/tmp/library";
        },
        pickFile: async () => {
          seen.push("file");
          return null;
        },
      },
      shell: { openPath: async () => {}, defaultLibraryDir: async () => "/home/u/Documents/fewer" },
    });

    expect(await dispatch("pick_library_dir")).toBe("/tmp/library");
    expect(await dispatch("pick_license_file")).toBeNull();
    expect(seen).toEqual(["dir", "file"]);
  });

  test("open_in_os rejects when the OS reports an error", async () => {
    const dispatch = createDispatch({
      dialogs: { pickDirectory: async () => null, pickFile: async () => null },
      shell: { openPath: async () => Promise.reject(new Error("no handler")), defaultLibraryDir: async () => "/home/u/Documents/fewer" },
    });
    await expect(dispatch("open_in_os", { path: "/tmp/x" })).rejects.toThrow(/no handler/);
  });

  test("unknown commands reject (mirrors Tauri); full surface present", async () => {
    const handlers = createHostHandlers({
      dialogs: { pickDirectory: async () => null, pickFile: async () => null },
      shell: { openPath: async () => {}, defaultLibraryDir: async () => "/home/u/Documents/fewer" },
    });
    expect(Object.keys(handlers).sort()).toEqual(
      [
        "default_library_dir",
        "fs_read_bytes",
        "fs_read_text",
        "fs_remove_file",
        "fs_write_text",
        "list_dir",
        "open_in_os",
        "pick_library_dir",
        "pick_license_file",
        "verify_license_sig",
      ].sort(),
    );
    const dispatch = createDispatch({
      dialogs: { pickDirectory: async () => null, pickFile: async () => null },
      shell: { openPath: async () => {}, defaultLibraryDir: async () => "/home/u/Documents/fewer" },
    });
    await expect(dispatch("bench_tree_json")).rejects.toThrow(/unknown command/);
  });

  test("default_library_dir returns the host-resolved default dir", async () => {
    const dispatch = createDispatch({
      dialogs: { pickDirectory: async () => null, pickFile: async () => null },
      shell: { openPath: async () => {}, defaultLibraryDir: async () => "/home/u/Documents/fewer" },
    });
    expect(await dispatch("default_library_dir")).toBe("/home/u/Documents/fewer");
  });
});
