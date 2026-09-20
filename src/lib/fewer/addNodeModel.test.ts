import { describe, test, expect } from "bun:test";
import { addNodeToast, validateAddName } from "./addNodeModel";

describe("addNodeToast", () => {
  test("child folder", () => {
    const t = addNodeToast("child", "folder", "Foo");
    expect(t.title).toBe("Folder added");
    expect(t.description).toBe('"Foo" added to folder');
  });
  test("child file", () => {
    const t = addNodeToast("child", "file", "bar.ts");
    expect(t.title).toBe("File added");
    expect(t.description).toBe('"bar.ts" added to folder');
  });
  test("standalone folder", () => {
    const t = addNodeToast("standalone", "folder", "My Folder");
    expect(t.title).toBe("Folder added");
    expect(t.description).toBe('"My Folder" added to canvas');
  });
  test("standalone file", () => {
    const t = addNodeToast("standalone", "file", "notes.md");
    expect(t.title).toBe("File added");
    expect(t.description).toBe('"notes.md" added to canvas');
  });
  test("parent", () => {
    const t = addNodeToast("parent", "folder", "Wrapper");
    expect(t.title).toBe("Parent folder added");
    expect(t.description).toBe('"Wrapper" is now the parent card');
  });
});

describe("validateAddName", () => {
  test("returns null for empty (caller default handles this)", () => {
    expect(validateAddName("", "folder")).toBeNull();
    expect(validateAddName("   ", "file")).toBeNull();
  });
  test("file without extension is rejected", () => {
    expect(validateAddName("readme", "file")).toBe("File names must include an extension.");
  });
  test("file with extension is accepted", () => {
    expect(validateAddName("readme.md", "file")).toBeNull();
  });
  test("folder is always accepted", () => {
    expect(validateAddName("my-folder", "folder")).toBeNull();
  });
});
