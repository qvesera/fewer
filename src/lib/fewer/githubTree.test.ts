import { describe, expect, test } from "bun:test";
import { buildTree, parseGitHubUrl, subtreeItems, type GitHubTreeItem } from "./githubTree";

function item(path: string, type: "blob" | "tree" = "blob", size?: number): GitHubTreeItem {
  return size === undefined ? { path, type } : { path, type, size };
}

describe("parseGitHubUrl", () => {
  test("plain repo → owner/repo, HEAD, empty path", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo")).toEqual({
      owner: "owner", repo: "repo", branch: "HEAD", path: "",
    });
  });

  test("tree/branch path → branch + subfolder path", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo/tree/feat/x/src/lib")).toEqual({
      owner: "owner", repo: "repo", branch: "feat", path: "x/src/lib",
    });
    // Deep branch/subfolder split is resolved later by resolveBranch (progressive
    // branch-name splits); the parser stops at the first path segment after "tree".
  });

  test("non-github host / malformed → null", () => {
    expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
    expect(parseGitHubUrl("not-a-url")).toBeNull();
  });
});

describe("subtreeItems", () => {
  test("no subfolder → items unchanged, empty root name", () => {
    const items = [item("a.txt"), item("src/b.ts")];
    const { stripped, rootName } = subtreeItems(items, "");
    expect(stripped).toEqual(items);
    expect(rootName).toBe("");
  });

  test("subfolder → prefixed items filtered and stripped; root becomes '.'", () => {
    const items = [
      item("src"), // tree root itself
      item("src/lib/a.ts"),
      item("src/lib/b.ts", "tree"),
      item("src/other.ts"),
      item("README.md"),
    ];
    const { stripped, rootName } = subtreeItems(items, "src");
    const paths = stripped.map((i) => i.path);
    expect(paths).toEqual([".", "lib/a.ts", "lib/b.ts", "other.ts"]);
    expect(rootName).toBe("src");
  });
});

describe("buildTree", () => {
  test("nests items into folders first, encoded web URLs", () => {
    const root = buildTree(
      "owner",
      "repo",
      "feat/x",
      "src",
      "src",
      [
        { ...item(".") },
        item("lib", "tree"),
        item("lib/a.ts"),
        item("main.ts"),
      ],
    );
    expect(root.name).toBe("src");
    // Segment-wise encoding: "/" in branch/path stays a path separator; only
    // the individual segments get encoded.
    expect(root.webUrl).toBe("https://github.com/owner/repo/tree/feat/x/src");
    expect(root.children!.map((c) => [c.name, c.type])).toEqual([
      ["lib", "folder"],
      ["main.ts", "file"],
    ]);
    const lib = root.children![0];
    expect(lib!.children![0]!.name).toBe("a.ts");
    // subfolder file URL is root-relative (src/ prefix restored)
    expect(lib!.children![0]!.webUrl).toBe("https://github.com/owner/repo/blob/feat/x/src/lib/a.ts");
  });

  test("repo-root case encodes only the branch", () => {
    const root = buildTree("o", "r", "main", "", "r", [item("a.ts")]);
    expect(root.webUrl).toBe("https://github.com/o/r/tree/main");
    expect(root.children![0]!.webUrl).toBe("https://github.com/o/r/blob/main/a.ts");
  });
});