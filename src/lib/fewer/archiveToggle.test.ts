import { beforeEach, describe, expect, test } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import type { FewerNode, FewerEdge } from "./types";
import { archiveExtensionOf, compressedName, extractedName } from "./archiveToggle";

function node(
  id: string,
  path: string,
  type: "folder" | "file" = "folder",
  extra: Record<string, unknown> = {},
): FewerNode {
  const name = path.split("/").pop() ?? path;
  const extension = type === "file" && name.includes(".") ? name.split(".").pop() : "";
  const label = extension ? name.slice(0, -(extension.length + 1)) : name;
  return {
    id,
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label, path, type, extension: extension || undefined, ...extra },
  } as unknown as FewerNode;
}

function edge(source: string, target: string): FewerEdge {
  return { id: `e-${source}-${target}`, source, target, type: "smoothstep" } as FewerEdge;
}

function seed(nodes: FewerNode[], edges: FewerEdge[]) {
  useGraphStore.setState({
    nodes,
    edges,
    past: [],
    future: [],
    selectedNodeIds: [],
    hiddenIds: [],
    independentlyHiddenIds: [],
    autoHiddenIds: [],
    revealedRootIds: [],
    categoryFilter: [],
    categoryHiddenIds: [],
    viewSettings: {},
  } as never);
}

const byId = (id: string) => useGraphStore.getState().nodes.find((n) => n.id === id)!;

describe("archive names", () => {
  test("the longest known extension wins", () => {
    expect(archiveExtensionOf("backup.tar.gz")).toBe("tar.gz");
    expect(archiveExtensionOf("photos.ZIP")).toBe("zip");
    expect(archiveExtensionOf("notes.txt")).toBeNull();
  });

  test("compress appends .zip; extract strips the archive extension", () => {
    expect(compressedName("Photos")).toBe("Photos.zip");
    expect(compressedName("Photos.zip")).toBe("Photos.zip");
    expect(extractedName("Photos.zip")).toBe("Photos");
    expect(extractedName("backup.tar.gz")).toBe("backup");
    expect(extractedName("notes.txt")).toBeNull();
  });
});

describe("compressFolder / extractArchive", () => {
  beforeEach(() => {
    seed(
      [
        node("root", "project", "folder", { isRoot: true }),
        node("photos", "project/Photos"),
        node("pic", "project/Photos/a.jpg", "file"),
      ],
      [edge("root", "photos"), edge("photos", "pic")],
    );
  });

  test("compress turns the card into an archive and rebases its subtree", () => {
    const result = useGraphStore.getState().compressFolder("photos");

    expect(result).toEqual({ ok: true, name: "Photos.zip" });
    expect(byId("photos").data.path).toBe("project/Photos.zip");
    expect(byId("photos").data.label).toBe("Photos.zip");
    expect(byId("photos").data.isArchive).toBe(true);
    expect(byId("pic").data.path).toBe("project/Photos.zip/a.jpg");
    expect(byId("pic").data.label).toBe("a");
  });

  test("undo restores the folder, its label and the descendant paths", () => {
    useGraphStore.getState().compressFolder("photos");
    useGraphStore.getState().undo();

    expect(byId("photos").data.path).toBe("project/Photos");
    expect(byId("photos").data.label).toBe("Photos");
    expect(byId("photos").data.isArchive).toBeUndefined();
    expect(byId("pic").data.path).toBe("project/Photos/a.jpg");
  });

  test("redo re-applies the archive shape", () => {
    useGraphStore.getState().compressFolder("photos");
    useGraphStore.getState().undo();
    useGraphStore.getState().redo();

    expect(byId("photos").data.isArchive).toBe(true);
    expect(byId("pic").data.path).toBe("project/Photos.zip/a.jpg");
  });

  test("extract is the inverse and rebases the subtree back", () => {
    useGraphStore.getState().compressFolder("photos");
    const result = useGraphStore.getState().extractArchive("photos");

    expect(result).toEqual({ ok: true, name: "Photos" });
    expect(byId("photos").data.path).toBe("project/Photos");
    expect(byId("photos").data.isArchive).toBeUndefined();
    expect(byId("pic").data.path).toBe("project/Photos/a.jpg");
  });

  test("a card inside an archive cannot change shape", () => {
    seed(
      [
        node("root", "project", "folder", { isRoot: true }),
        node("zip", "project/Logos.zip", "folder", { isArchive: true }),
        node("inner", "project/Logos.zip/Logos", "folder"),
      ],
      [edge("root", "zip"), edge("zip", "inner")],
    );

    const result = useGraphStore.getState().compressFolder("inner");

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("inside an archive");
    expect(byId("inner").data.path).toBe("project/Logos.zip/Logos");
  });

  test("a folder holding an archive card cannot be compressed", () => {
    seed(
      [
        node("root", "project", "folder", { isRoot: true }),
        node("photos", "project/Photos"),
        node("zip", "project/Photos/inner.zip", "folder", { isArchive: true }),
      ],
      [edge("root", "photos"), edge("photos", "zip")],
    );

    const result = useGraphStore.getState().compressFolder("photos");

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("holds an archive");
  });

  test("a sibling with the target name blocks the change", () => {
    seed(
      [
        node("root", "project", "folder", { isRoot: true }),
        node("photos", "project/Photos"),
        node("taken", "project/Photos.zip", "folder", { isArchive: true }),
      ],
      [edge("root", "photos"), edge("root", "taken")],
    );

    const result = useGraphStore.getState().compressFolder("photos");

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("already exists");
  });

  test("a file card is rejected, and so is extracting a plain folder", () => {
    seed(
      [
        node("root", "project", "folder", { isRoot: true }),
        node("file", "project/a.txt", "file"),
        node("plain", "project/Plain"),
      ],
      [edge("root", "file"), edge("root", "plain")],
    );

    expect(useGraphStore.getState().compressFolder("file").ok).toBe(false);
    expect(useGraphStore.getState().extractArchive("plain").ok).toBe(false);
  });
});

