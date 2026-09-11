import { describe, test, expect } from "bun:test";
import { entryExists, getUniqueName } from "./fsPrimitives";

/**
 * entryExists + getUniqueName are the only fsPrimitives functions that don't
 * require DOM or writable FS handles — they issue read-only FS API calls
 * (getFileHandle / getDirectoryHandle) that we can mock. These tests clear
 * the swallowed-catch biomarker in entryExists and the collision-loop logic
 * in getUniqueName.
 */

function makeMockHandle(entries: Record<string, "file" | "directory">) {
  const keys = Object.keys(entries);
  return {
    async getFileHandle(name: string) {
      if (entries[name] === "file") return { kind: "file", name };
      throw new DOMException("NotFoundError");
    },
    async getDirectoryHandle(name: string) {
      if (entries[name] === "directory") return { kind: "directory", name };
      throw new DOMException("NotFoundError");
    },
    _entries: keys,
  } as unknown as FileSystemDirectoryHandle;
}

describe("entryExists", () => {
  test("returns 'file' when name matches a file entry", async () => {
    const h = makeMockHandle({ "readme.txt": "file", src: "directory" });
    expect(await entryExists(h, "readme.txt")).toBe("file");
  });

  test("returns 'directory' when name matches a directory entry", async () => {
    const h = makeMockHandle({ "readme.txt": "file", src: "directory" });
    expect(await entryExists(h, "src")).toBe("directory");
  });

  test("returns null when nothing matches", async () => {
    const h = makeMockHandle({ "readme.txt": "file" });
    expect(await entryExists(h, "nope")).toBeNull();
  });

  test("does not swallow the file error before trying directory", async () => {
    // If the implementation swallowed the getFileHandle rejection without
    // trying getDirectoryHandle, this would return null for a directory.
    const h = makeMockHandle({ docs: "directory" });
    expect(await entryExists(h, "docs")).toBe("directory");
  });
});

describe("getUniqueName", () => {
  test("returns baseName when nothing collides", async () => {
    const h = makeMockHandle({ "other.txt": "file" });
    expect(await getUniqueName(h, "new.txt")).toBe("new.txt");
  });

  test("appends ' copy' on first collision", async () => {
    const h = makeMockHandle({ "doc.txt": "file" });
    expect(await getUniqueName(h, "doc.txt")).toBe("doc copy.txt");
  });

  test("increments counter on repeated collisions", async () => {
    const h = makeMockHandle({
      "doc.txt": "file",
      "doc copy.txt": "file",
      "doc copy 2.txt": "file",
    });
    expect(await getUniqueName(h, "doc.txt")).toBe("doc copy 3.txt");
  });

  test("handles names without extension", async () => {
    const h = makeMockHandle({ Makefile: "file", "Makefile copy": "file" });
    expect(await getUniqueName(h, "Makefile")).toBe("Makefile copy 2");
  });
});
