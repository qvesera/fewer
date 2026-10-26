/**
 * Coverage for `src/lib/fewer/fileSystem.ts` — the file the lcov ingest
 * (#449) exposed as the repo's worst score (1.0 at 10% line coverage).
 *
 * Lives here (not in src/lib) because every picker path needs window/document,
 * and only this suite runs with the happy-dom preload — same arrangement as
 * fsInputFallback.test.ts. No mock.module: the legacy <input> fallback is
 * driven for real by dispatching `cancel`, and the FSA feature flag is flipped
 * with a finally-restore.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { LOCAL_FS_FEATURES } from "@/lib/fewer/features";

const {
  pickDirectoryTree,
  detectBrave,
  isFileSystemAccessSupported,
  isIframeContext,
  updateDirectoryOnDisk,
  setStoredRootHandle,
  getStoredRootHandle,
} = await import("@/lib/fewer/fileSystem");

type FsaFlags = { fsaDirectoryPicker: boolean };
const flags = LOCAL_FS_FEATURES as FsaFlags;

/** Run `fn` with the FSA flag forced on/off; restores whatever it was. */
async function withFsa(enabled: boolean, fn: () => Promise<void>): Promise<void> {
  const prev = flags.fsaDirectoryPicker;
  flags.fsaDirectoryPicker = enabled;
  try {
    await fn();
  } finally {
    flags.fsaDirectoryPicker = prev;
  }
}

type WindowWithPicker = Window & { showDirectoryPicker?: unknown };

function setPicker(fn: unknown): void {
  (window as WindowWithPicker).showDirectoryPicker = fn;
}
function clearPicker(): void {
  delete (window as WindowWithPicker).showDirectoryPicker;
}

function setBrave(isBrave: () => Promise<boolean>): void {
  Object.defineProperty(navigator, "brave", {
    value: { isBrave },
    configurable: true,
  });
}
function clearBrave(): void {
  delete (navigator as unknown as { brave?: unknown }).brave;
}

/** Start a picker call and settle the legacy input fallback as "dismissed". */
async function fallbackViaInput(promise: Promise<unknown>): Promise<unknown> {
  await Promise.resolve();
  const input = document.querySelector<HTMLInputElement>("input[webkitdirectory]");
  expect(input).toBeTruthy();
  input!.dispatchEvent(new Event("cancel"));
  return promise;
}

/** A directory handle with one file — buildTreeFromHandle only reads values(). */
function fakeHandle(name = "picked", size = 3) {
  return {
    kind: "directory",
    name,
    values: async function* () {
      yield {
        name: "a.txt",
        kind: "file",
        getFile: async () => ({ size }),
      };
    },
  } as unknown as FileSystemDirectoryHandle;
}

afterEach(() => {
  clearPicker();
  clearBrave();
});

describe("pickDirectoryTree", () => {
  test("FSA flag off → legacy input fallback, dismissed = null", async () => {
    await withFsa(false, async () => {
      expect(await fallbackViaInput(pickDirectoryTree())).toBeNull();
    });
  });

  test("flag on but no showDirectoryPicker → same input fallback", async () => {
    clearPicker();
    await withFsa(true, async () => {
      expect(await fallbackViaInput(pickDirectoryTree())).toBeNull();
    });
  });

  test("flag on + picker success → tree, stored handle, progress", async () => {
    const handle = fakeHandle();
    const seen: { phase?: string }[] = [];
    let receivedOpts: unknown;
    await withFsa(true, async () => {
      setPicker(async (opts: unknown) => {
        receivedOpts = opts;
        return handle;
      });
      const tree = await pickDirectoryTree(undefined, undefined, (p) => seen.push(p));
      expect(tree?.name).toBe("picked");
      expect(tree?.children?.map((c) => c.name)).toEqual(["a.txt"]);
      expect(receivedOpts).toMatchObject({ mode: "readwrite", id: "fewer-import" });
      expect(getStoredRootHandle()).toBe(handle);
      expect(seen).toContainEqual({ phase: "Reading folder" });
    });
  });

  test("picker AbortError (user cancel) → null", async () => {
    await withFsa(true, async () => {
      setPicker(async () => {
        throw new DOMException("dismissed", "AbortError");
      });
      expect(await pickDirectoryTree()).toBeNull();
    });
  });

  test("any other picker error rethrows", async () => {
    await withFsa(true, async () => {
      setPicker(async () => {
        throw new DOMException("denied", "NotAllowedError");
      });
      await expect(pickDirectoryTree()).rejects.toThrow();
    });
  });

  test("Brave + SecurityError → the actionable Brave message", async () => {
    await withFsa(true, async () => {
      setBrave(async () => true);
      setPicker(async () => {
        throw new DOMException("blocked", "SecurityError");
      });
      await expect(pickDirectoryTree()).rejects.toThrow(
        "Brave browser blocks the File System Access API by default",
      );
    });
  });

  test("Brave branch rethrows non-Security errors (AbortError included)", async () => {
    // Deliberate asymmetry with the non-Brave path: the Brave branch has no
    // "user cancelled → null" swallow — pin it so a future fix is a choice.
    await withFsa(true, async () => {
      setBrave(async () => true);
      setPicker(async () => {
        throw new DOMException("dismissed", "AbortError");
      });
      await expect(pickDirectoryTree()).rejects.toThrow();
    });
  });
});

describe("detection helpers", () => {
  test("isFileSystemAccessSupported tracks the picker", () => {
    clearPicker();
    expect(isFileSystemAccessSupported()).toBe(false);
    setPicker(async () => fakeHandle());
    expect(isFileSystemAccessSupported()).toBe(true);
  });

  test("detectBrave answers false, true, and false-on-throw", async () => {
    clearBrave();
    expect(await detectBrave()).toBe(false);

    setBrave(async () => true);
    expect(await detectBrave()).toBe(true);

    setBrave(async () => {
      throw new Error("probe failed");
    });
    expect(await detectBrave()).toBe(false); // the catch swallows
  });

  test("isIframeContext is false at top level", () => {
    expect(isIframeContext()).toBe(false);
  });

  test("isIframeContext returns true when window access throws", () => {
    Object.defineProperty(window, "self", {
      get() {
        throw new Error("cross-origin");
      },
      configurable: true,
    });
    try {
      expect(isIframeContext()).toBe(true);
    } finally {
      delete (window as unknown as { self?: unknown }).self;
    }
  });
});

describe("stored root handle", () => {
  test("round-trips a handle and clears back to null", () => {
    const handle = fakeHandle();
    setStoredRootHandle(handle);
    expect(getStoredRootHandle()).toBe(handle);
    setStoredRootHandle(null);
    expect(getStoredRootHandle()).toBeNull();
  });
});

describe("updateDirectoryOnDisk", () => {
  /** Path-aware fake: existence decided by exact path in `existing`. */
  function fakeRoot(existing: string[], failCreate: string[] = []) {
    const ex = new Set(existing);
    const bad = new Set(failCreate);
    const handleFor = (path: string): FileSystemDirectoryHandle =>
      ({
        getDirectoryHandle: async (name: string, opts?: { create?: boolean }) => {
          const child = path ? `${path}/${name}` : name;
          if (!opts?.create) {
            if (ex.has(child)) return handleFor(child);
            throw new DOMException("missing", "NotFoundError");
          }
          if (bad.has(child)) throw new DOMException("denied", "NotAllowedError");
          return handleFor(child);
        },
      }) as unknown as FileSystemDirectoryHandle;
    return handleFor("");
  }

  // Graph: A (root folder) → B (folder) → C (folder); A → F (file).
  const nodes = [
    { id: "A", data: { label: "A", type: "folder", path: "" } },
    { id: "B", data: { label: "B", type: "folder", path: "A" } },
    { id: "C", data: { label: "C", type: "folder", path: "A/B" } },
    { id: "F", data: { label: "F.txt", type: "file", path: "A/F.txt" } },
  ];
  const edges = [
    { source: "A", target: "B" },
    { source: "B", target: "C" },
    { source: "A", target: "F" },
  ];

  test("creates the whole chain, skipping non-folder nodes", async () => {
    const res = await updateDirectoryOnDisk(fakeRoot([]), nodes, edges);
    expect(res.created).toEqual(["A", "A/B", "A/B/C"]);
    expect(res.skipped).toEqual([]);
    expect(res.failed).toEqual([]);
  });

  test("existing directories land in skipped, not created", async () => {
    const res = await updateDirectoryOnDisk(
      fakeRoot(["A", "A/B", "A/B/C"]),
      nodes,
      edges,
    );
    expect(res.created).toEqual([]);
    expect(res.skipped).toEqual(["A", "A/B", "A/B/C"]);
    expect(res.failed).toEqual([]);
  });

  test("a failing subtree reports failed and keeps walking siblings", async () => {
    const warn = console.warn;
    console.warn = () => {}; // the failure path logs — keep test output clean
    try {
      const res = await updateDirectoryOnDisk(
        fakeRoot(["A"], ["A/B"]),
        nodes,
        edges,
      );
      expect(res.skipped).toEqual(["A"]);
      expect(res.failed).toEqual(["A/B"]);
      expect(res.created).toEqual([]); // C is unreachable once B fails
    } finally {
      console.warn = warn;
    }
  });

  test("only parentless folders count as roots", async () => {
    const fileOnly = nodes.filter((n) => n.data.type === "file");
    const res = await updateDirectoryOnDisk(fakeRoot([]), fileOnly, []);
    expect(res).toEqual({ created: [], skipped: [], failed: [] });
  });
});

