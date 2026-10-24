import { describe, expect, test } from "bun:test";
import {
  DEFAULT_IMPORT_OPTIONS,
  OPTION_SCOPES,
  RELEVANT_OPTIONS,
  optionScopeFor,
  scopeOptionsToOrigin,
  type ImportOptions,
  type OptionKey,
  type OptionScope,
} from "./importOptions";
import { filterTree } from "./treeToGraph";
import type { TreeEntry } from "./types";

const ALL_KEYS = Object.keys(DEFAULT_IMPORT_OPTIONS) as OptionKey[];

/** The scoping decision's source shape (what `scopeOptionsToOrigin` takes). */
type ScopeSource = Parameters<typeof scopeOptionsToOrigin>[1];

/** Map a scope back to the source shape the scoping decision takes. */
const sourceFor = (scope: OptionScope): ScopeSource =>
  scope.startsWith("file:")
    ? { origin: "file", kind: scope === "file:archive" ? "archive" : "text" }
    : { origin: scope as Exclude<ScopeSource["origin"], "file"> };

const scoped = (scope: OptionScope, over: Partial<ImportOptions> = {}) =>
  scopeOptionsToOrigin({ ...DEFAULT_IMPORT_OPTIONS, ...over }, sourceFor(scope));

const namesOf = (root: TreeEntry): string[] => {
  const names: string[] = [];
  const walk = (e: TreeEntry) => {
    names.push(e.name);
    e.children?.forEach(walk);
  };
  walk(root);
  return names;
};

describe("RELEVANT_OPTIONS", () => {
  test("every scope names only real keys, and folder names all of them", () => {
    for (const scope of OPTION_SCOPES) {
      for (const key of RELEVANT_OPTIONS[scope]) {
        expect(ALL_KEYS).toContain(key);
      }
    }
    expect(new Set(RELEVANT_OPTIONS.folder)).toEqual(new Set(ALL_KEYS));
  });

  test("a pasted file gets exactly the two content-relevant options plus display", () => {
    expect(new Set(RELEVANT_OPTIONS["file:text"])).toEqual(
      new Set(["includeVendored", "includeFiles", "displayMaxDepth"]),
    );
  });

  test("an archive listing keeps the scan filters but not the walk-only switches", () => {
    expect(new Set(RELEVANT_OPTIONS["file:archive"])).toEqual(
      new Set([
        "maxDepth",
        "includeHidden",
        "includeVendored",
        "skipEmptyFolders",
        "extensions",
        "caseSensitiveExtensions",
        "includeFiles",
        "displayMaxDepth",
      ]),
    );
  });

  test("symlinks and expandArchives are folder-only", () => {
    for (const scope of OPTION_SCOPES.filter((s) => s !== "folder")) {
      expect(RELEVANT_OPTIONS[scope]).not.toContain("symlinks");
      expect(RELEVANT_OPTIONS[scope]).not.toContain("expandArchives");
    }
  });

  test("optionScopeFor picks the payload for the file origin", () => {
    expect(optionScopeFor({ origin: "file", kind: "text" })).toBe("file:text");
    expect(optionScopeFor({ origin: "file", kind: "archive" })).toBe("file:archive");
    expect(optionScopeFor({ origin: "folder" })).toBe("folder");
    expect(optionScopeFor({ origin: "url" })).toBe("url");
    expect(optionScopeFor({ origin: "cloud" })).toBe("cloud");
  });
});

describe("scopeOptionsToOrigin — a file import cannot be rewritten by saved scan defaults", () => {
  test("the values a folder import leaves behind are neutralised for a file import", () => {
    // Exactly the settings a folder import produces and persists.
    const leaked: ImportOptions = {
      ...DEFAULT_IMPORT_OPTIONS,
      maxDepth: 6,
      includeHidden: false,
      skipEmptyFolders: true,
      extensions: ["ts"],
      symlinks: "skip",
      expandArchives: true,
    };
    const s = scopeOptionsToOrigin(leaked, sourceFor("file:text"));
    expect(s.maxDepth).toBe(0);
    expect(s.includeHidden).toBe(true);
    expect(s.skipEmptyFolders).toBe(false);
    expect(s.extensions).toEqual([]);
    expect(s.symlinks).toBe("leaf");
    expect(s.expandArchives).toBe(false);
    // …while the options file imports DO honour pass through untouched.
    expect(s.includeVendored).toBe(false);
    expect(s.includeFiles).toBe(true);
    expect(s.displayMaxDepth).toBe(6);
  });

  test("a folder import keeps every option", () => {
    const leaked: ImportOptions = {
      ...DEFAULT_IMPORT_OPTIONS,
      maxDepth: 9,
      includeHidden: true,
      expandArchives: true,
    };
    expect(scopeOptionsToOrigin(leaked, sourceFor("folder"))).toEqual(leaked);
  });

  test("an archive listing keeps scan filters but drops the walk-only switches", () => {
    const s = scoped("file:archive", { maxDepth: 4, includeHidden: true, symlinks: "follow", expandArchives: true });
    expect(s.maxDepth).toBe(4);
    expect(s.includeHidden).toBe(true);
    expect(s.symlinks).toBe("leaf");
    expect(s.expandArchives).toBe(false);
  });

  test("url and cloud keep scan filters but drop the walk-only switches", () => {
    for (const scope of ["url", "cloud"] as const) {
      const s = scoped(scope, { maxDepth: 4, includeHidden: true, symlinks: "follow", expandArchives: true });
      expect(s.maxDepth).toBe(4);
      expect(s.includeHidden).toBe(true);
      expect(s.symlinks).toBe("leaf");
      expect(s.expandArchives).toBe(false);
    }
  });

  test("a preference saved for one scope cannot leak into another", () => {
    const forFolder = scoped("folder", { maxDepth: 2, includeHidden: true });
    expect(scopeOptionsToOrigin(forFolder, sourceFor("file:text")).maxDepth).toBe(0);
  });
});

describe("scopeOptionsToOrigin — a pasted export arrives intact", () => {
  /** Eight levels deep, plus a dotfile folder and an empty folder. */
  const deepExport = (): TreeEntry => {
    const node = (name: string, type: "folder" | "file", children?: TreeEntry[]): TreeEntry => ({
      name,
      type,
      ...(children ? { children } : {}),
    });
    let inner: TreeEntry = node("a.ts", "file");
    for (let d = 7; d >= 0; d--) inner = node(`level${d}`, "folder", [inner]);
    return node("root", "folder", [inner, node(".github", "folder", [node("ci.yml", "file")]), node("empty", "folder")]);
  };

  test("with unscoped defaults the export is silently truncated and emptied (the bug)", () => {
    const filtered = filterTree(deepExport(), DEFAULT_IMPORT_OPTIONS);
    expect(filtered).not.toBeNull();
    const names = namesOf(filtered!);
    expect(names).toContain("root");
    expect(names).not.toContain("level7"); // the deep chain was cut at maxDepth 6
    expect(names).not.toContain(".github"); // dropped by the hidden filter
  });

  test("through the scoped options it survives in full", () => {
    const filtered = filterTree(deepExport(), scopeOptionsToOrigin(DEFAULT_IMPORT_OPTIONS, sourceFor("file:text")));
    expect(filtered).not.toBeNull();
    const names = namesOf(filtered!);
    expect(names).toContain("level0");
    expect(names).toContain("level7");
    expect(names).toContain(".github");
    expect(names).toContain("empty");
  });
});
