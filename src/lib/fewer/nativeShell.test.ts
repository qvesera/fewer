// T-094 seam: host detection + RPC routing across the two desktop hosts.
//
// The seam is the whole point of the desktop pivot: feature code must be able
// to say "am I in a desktop shell?" and "run this command" without knowing
// whether the host is Tauri or Electron. These tests pin both halves of that
// contract — detection per bridge, routing to the right bridge, and the
// rejection path in the plain web app.
//
// Window isolation matters: bun runs every test file in one process, so each
// case installs its own fake `window` and the suite restores whatever the
// process had (AGENTS.md → component test isolation).

import { afterEach, describe, expect, test } from "bun:test";
import { hostFilePathForDrop, hostInvoke, isElectron, isHost, isTauri, nativeListDir } from "./nativeShell";

type FakeWindow = Record<string, unknown>;
const g = globalThis as unknown as { window?: FakeWindow };
const hadWindow = "window" in g;
const originalWindow = g.window;

function installWindow(fake: FakeWindow): void {
  g.window = fake;
}

afterEach(() => {
  if (hadWindow) g.window = originalWindow;
  else delete g.window;
});

describe("hostFilePathForDrop (T-122)", () => {
  const dropped = new File(["x"], "notes.md");

  test("no window → empty path (web app)", () => {
    delete g.window;
    expect(hostFilePathForDrop(dropped)).toBe("");
  });

  test("bridge without the filePath helper → empty path (Tauri, older preload)", () => {
    installWindow({ __FEWER_NATIVE__: { invoke: () => Promise.resolve() } });
    expect(hostFilePathForDrop(dropped)).toBe("");
  });

  test("Electron preload helper → absolute path", () => {
    const seen: unknown[] = [];
    installWindow({
      __FEWER_NATIVE__: {
        invoke: () => Promise.resolve(),
        filePath: (f: unknown) => {
          seen.push(f);
          return "/home/u/notes.md";
        },
      },
    });
    expect(hostFilePathForDrop(dropped)).toBe("/home/u/notes.md");
    expect(seen).toEqual([dropped]);
  });

  test("helper returning empty or throwing → empty path", () => {
    installWindow({ __FEWER_NATIVE__: { invoke: () => Promise.resolve(), filePath: () => "" } });
    expect(hostFilePathForDrop(dropped)).toBe("");
    installWindow({
      __FEWER_NATIVE__: {
        invoke: () => Promise.resolve(),
        filePath: () => { throw new Error("not a File"); },
      },
    });
    expect(hostFilePathForDrop(dropped)).toBe("");
  });

  test("no file at all → empty path", () => {
    installWindow({ __FEWER_NATIVE__: { invoke: () => Promise.resolve(), filePath: () => "/x" } });
    expect(hostFilePathForDrop(null)).toBe("");
    expect(hostFilePathForDrop(undefined)).toBe("");
  });
});

describe("host detection", () => {
  test("no window at all → no host", () => {
    delete g.window;
    expect(isTauri()).toBe(false);
    expect(isElectron()).toBe(false);
    expect(isHost()).toBe(false);
  });

  test("Tauri internals → isTauri only", () => {
    installWindow({ __TAURI_INTERNALS__: { invoke: () => Promise.resolve() } });
    expect(isTauri()).toBe(true);
    expect(isElectron()).toBe(false);
    expect(isHost()).toBe(true);
  });

  test("Electron bridge → isElectron only", () => {
    installWindow({ __FEWER_NATIVE__: { invoke: () => Promise.resolve() } });
    expect(isElectron()).toBe(true);
    expect(isTauri()).toBe(false);
    expect(isHost()).toBe(true);
  });
});

describe("hostInvoke routing", () => {
  test("routes to the Electron bridge with the command + args", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    installWindow({
      __FEWER_NATIVE__: {
        invoke: <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
          calls.push({ cmd, args });
          return Promise.resolve({ entries: [], total: 0 } as T);
        },
      },
    });

    const page = await nativeListDir("/tmp/library", 0, 50);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cmd).toBe("list_dir");
    expect(calls[0]!.args).toEqual({ path: "/tmp/library", offset: 0, limit: 50 });
    expect(page.total).toBe(0);
  });

  test("routes to Tauri internals when that is the only bridge", async () => {
    const seen: string[] = [];
    installWindow({
      __TAURI_INTERNALS__: {
        invoke: <T,>(cmd: string): Promise<T> => {
          seen.push(cmd);
          return Promise.resolve(undefined as T);
        },
      },
    });

    await hostInvoke("open_in_os", { path: "/tmp/x" });
    expect(seen).toEqual(["open_in_os"]);
  });

  test("web app (no bridge) rejects with the command name", async () => {
    delete g.window;
    await expect(hostInvoke("fs_read_text", { path: "/tmp/x" })).rejects.toThrow(
      /no host bridge[\s\S]*fs_read_text/,
    );
  });
});
