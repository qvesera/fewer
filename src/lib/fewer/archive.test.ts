import { test, expect } from "bun:test";
import { parseArchiveUrl, buildTreeFromArchiveMetadata } from "./archive";
import type { ArchiveMetadata } from "./archive";

test("parseArchiveUrl extracts identifiers from all archive.org URL shapes", () => {
  expect(parseArchiveUrl("https://archive.org/details/msdos_Prince_of_Persia_1990")).toBe(
    "msdos_Prince_of_Persia_1990"
  );
  expect(parseArchiveUrl("https://archive.org/download/msdos_Prince_of_Persia_1990/")).toBe(
    "msdos_Prince_of_Persia_1990"
  );
  expect(parseArchiveUrl("https://archive.org/metadata/some_id/")).toBe("some_id");
  // Deep path still resolves to the item identifier.
  expect(parseArchiveUrl("https://archive.org/download/abc123/subdir/file.zip")).toBe("abc123");
  // Non-item URLs are rejected.
  expect(parseArchiveUrl("https://archive.org/")).toBeNull();
  expect(parseArchiveUrl("https://archive.org/search")).toBeNull();
  expect(parseArchiveUrl("https://example.com/details/foo")).toBeNull();
  expect(parseArchiveUrl("not a url")).toBeNull();
});

test("buildTreeFromArchiveMetadata builds nested folders, files, sizes, webUrls", () => {
  const meta: ArchiveMetadata = {
    dirs: ["/", "/manuals"],
    files: [
      { name: "game.zip", size: "353695", format: "ZIP", source: "original" },
      { name: "manuals/readme.txt", size: 1024, source: "original" },
      { name: "manuals/", size: "0", source: "original" },
      // Derivative noise should be dropped.
      { name: "game_thumb.jpg", size: "7900", format: "JPEG Thumb", source: "derivative" },
      { name: "game_meta.xml", size: "6153", format: "Metadata", source: "original" },
    ],
  };
  const { tree, truncated } = buildTreeFromArchiveMetadata("my_item", meta);

  expect(truncated).toBe(false);
  expect(tree.name).toBe("my_item");
  expect(tree.type).toBe("folder");
  expect(tree.webUrl).toBe("https://archive.org/details/my_item");

  // Folders first, then files, alphabetical.
  const names = tree.children!.map((c) => c.name);
  expect(names).toEqual(["manuals", "game.zip"]);

  const manuals = tree.children![0];
  expect(manuals.type).toBe("folder");
  expect(manuals.children!.map((c) => c.name + (c.type === "file" ? `:${c.size}` : ""))).toEqual([
    "readme.txt:1024",
  ]);

  const zip = tree.children!.find((c) => c.name === "game.zip")!;
  expect(zip.size).toBe(353695);
  expect(zip.webUrl).toBe("https://archive.org/download/my_item/game.zip");
  expect(manuals.children![0].webUrl).toBe(
    "https://archive.org/download/my_item/manuals/readme.txt"
  );
});

test("buildTreeFromArchiveMetadata creates parent folders on demand (no dirs array)", () => {
  const meta: ArchiveMetadata = {
    files: [{ name: "a/b/c.txt", size: "5", source: "original" }],
  };
  const { tree } = buildTreeFromArchiveMetadata("flat", meta);
  const a = tree.children![0];
  expect(a.name).toBe("a");
  expect(a.type).toBe("folder");
  expect(a.children![0].name).toBe("b");
  expect(a.children![0].children![0]).toMatchObject({ name: "c.txt", type: "file", size: 5 });
});

test("buildTreeFromArchiveMetadata URL-encodes identifiers and file paths", () => {
  const meta: ArchiveMetadata = {
    files: [{ name: "dir with space/file name.txt", size: "1", source: "original" }],
  };
  const { tree } = buildTreeFromArchiveMetadata("my id", meta);
  expect(tree.webUrl).toBe("https://archive.org/details/my%20id");
  const folder = tree.children!.find((c) => c.type === "folder")!;
  const file = folder.children![0];
  expect(file.webUrl).toBe(
    "https://archive.org/download/my%20id/dir%20with%20space/file%20name.txt"
  );
});
