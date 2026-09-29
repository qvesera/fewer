/**
 * Regression coverage for the `<input webkitdirectory>` fallback:
 *
 *  - dismissing the OS picker must SETTLE the promise. It used to hang forever,
 *    which left the import dialog in its "importing" state forever — and the
 *    dialog refused to close mid-import, so the whole app was wedged.
 *  - a successful pick must report determinate progress up to the total.
 */
import { describe, expect, test } from "bun:test";
import type { ImportProgress } from "@/lib/fewer/importFlow";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/fewer/importOptions";

const { pickDirectoryViaInput } = await import("@/lib/fewer/fsInputFallback");

/** Build a File that looks like one the directory picker handed over. */
function pickedFile(path: string): File {
  const file = new File([new Uint8Array([1, 2, 3])], path.split("/").pop()!);
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

describe("pickDirectoryViaInput", () => {
  test("dismissing the picker settles as cancelled and removes the input", async () => {
    const promise = pickDirectoryViaInput(DEFAULT_IMPORT_OPTIONS);
    await Promise.resolve();

    const input = document.querySelector<HTMLInputElement>("input[webkitdirectory]");
    expect(input).toBeTruthy();
    input!.dispatchEvent(new Event("cancel"));

    // null === "user dismissed it", which runFolderImport maps to
    // { ok: false, cancelled: true } so the dialog stops its spinner.
    expect(await promise).toBeNull();
    expect(document.querySelector("input[webkitdirectory]")).toBeNull();
  });

  test("a picked folder reports determinate progress up to the total", async () => {
    const seen: ImportProgress[] = [];
    const files = [
      pickedFile("root/a.txt"),
      pickedFile("root/nested/b.txt"),
      pickedFile("root/nested/deeper/c.txt"),
    ];

    const promise = pickDirectoryViaInput(DEFAULT_IMPORT_OPTIONS, (p) =>
      seen.push(p),
    );
    await Promise.resolve();

    // A plain array stands in for the FileList: pickDirectoryViaInput only ever
    // does Array.from(files).
    const created = document.querySelector<HTMLInputElement>(
      "input[webkitdirectory]",
    )!;
    Object.defineProperty(created, "files", { value: files, configurable: true });
    created.dispatchEvent(new Event("change"));

    const tree = await promise;
    expect(tree?.name).toBe("root");
    expect(tree?.children?.length).toBeGreaterThan(0);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toMatchObject({
      phase: "Reading folder",
      processed: files.length,
      total: files.length,
    });
    // Monotonic — a bar must never run backwards.
    const processed = seen.map((p) => p.processed ?? 0);
    expect([...processed].sort((a, b) => a - b)).toEqual(processed);
  });
});
