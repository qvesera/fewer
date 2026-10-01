/**
 * Shared contract for the unified 3-step import flow:
 * step 1 select origin → step 2 configure options → step 3 import.
 * The options panel (ImportOptionsPanel) is identical for every origin;
 * only the import action changes per origin.
 */
import type { CloudProvider } from "@/lib/fewer/cloud/types";
import { formatBytes } from "@/lib/fewer/stats";
import { guessCsvMapping, isCsvMappingUsable, isExportCsv, parseCsvRows } from "@/lib/fewer/csvModel";
import type { CsvColumnMap } from "@/lib/fewer/csvModel";
import { useGraphStore } from "@/store/graphStore";

export type ImportOrigin = "folder" | "file" | "url" | "cloud";

export type FileImportFormat = "json" | "tree" | "script" | "csv" | "dot";

/**
 * Extensions the archive reader accepts. ONE list serves two jobs: the file
 * input's accept attribute and the panel's mode detection — so the picker and
 * the UI can never drift into two disagreeing lists.
 *
 * `listArchive` sniffs magic bytes rather than extensions, so this is a UI
 * hint only: a renamed archive still imports once the user is in archive mode.
 */
export const ARCHIVE_EXTENSIONS = [
  "zip",
  "tar",
  "gz",
  "tgz",
  "tar.gz",
  "tar.xz",
  "tar.bz2",
  "tar.zst",
  "7z",
  "rar",
  "xz",
  "bz2",
  "zst",
] as const;

/** Derived accept attribute. Always includes archives — never tier/flag gated. */
export const ARCHIVE_ACCEPT = ARCHIVE_EXTENSIONS.map((e) => `.${e}`).join(",");

/** Does this filename look like an archive the reader can list? */
export function isArchiveFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
}

/**
 * What the user picked in step 1 for the active origin.
 *
 * Archive is NOT its own origin: both payloads below converge on filterTree →
 * chunkTreeToGraph → setGraph, and the reader sniffs magic bytes, so the
 * extension is only a UI hint for which panel to show.
 */
export type OriginSource =
  | { origin: "folder" }
  | {
      origin: "file";
      kind: "text";
      content: string;
      format: FileImportFormat;
      /** Set when the CSV is not our own export: which column plays which role. */
      csvMapping?: CsvColumnMap;
    }
  | { origin: "file"; kind: "archive"; file: File | null; name: string }
  | { origin: "url"; url: string; watch: boolean }
  | {
      origin: "cloud";
      connectionId: string;
      provider: CloudProvider;
      ref: string;
      name: string;
    };

/** The file origin's text payload (pasted or uploaded as text). */
export type TextFileSource = Extract<OriginSource, { origin: "file"; kind: "text" }>;
/** The file origin's archive payload (picked as a binary file). */
export type ArchiveFileSource = Extract<OriginSource, { origin: "file"; kind: "archive" }>;

export interface ImportActionResult {
  ok: boolean;
  /** True when the user aborted (e.g. closed the native folder picker). Not an error. */
  cancelled?: boolean;
  title: string;
  description?: string;
  /** Error message when ok === false. */
  error?: string;
  /** Extra toasts shown after a successful import (e.g. auto-hidden folders). */
  notes?: { title: string; description: string }[];
}

/** One progress report from a step-3 import. Omit `total` when it is unknown. */
export interface ImportProgress {
  /** Human-readable step, e.g. "Reading folder" / "Building graph". */
  phase: string;
  processed?: number;
  total?: number;
}

export type ImportProgressFn = (progress: ImportProgress) => void;

// Re-exported so the whole progress contract is importable from one place.
export { yieldToUI } from "./asyncYield";

/** Adapt chunkTreeToGraph's raw (processed, total, phase) callback to the
 *  ImportProgress contract, or undefined when nobody is listening. */
export function buildProgress(onProgress?: ImportProgressFn) {
  if (!onProgress) return undefined;
  return (p: { processed: number; total: number }) =>
    onProgress({ phase: "Building graph", processed: p.processed, total: p.total });
}

export const ORIGIN_META: Record<
  ImportOrigin,
  { label: string; blurb: string }
> = {
  folder: { label: "Folder", blurb: "Scan a directory on this device" },
  file: {
    label: "File",
    blurb: "ASCII tree, JSON, CSV, DOT, shell script — or a zip/tar archive",
  },
  url: { label: "URL", blurb: "GitHub repo or public file index" },
  cloud: { label: "Cloud", blurb: "Linked cloud account (read-only)" },
};

export function defaultSourceFor(origin: ImportOrigin): OriginSource {
  switch (origin) {
    case "folder":
      return { origin: "folder" };
    case "file":
      return defaultFileSource("text");
    case "url":
      return { origin: "url", url: "", watch: false };
    case "cloud":
      return { origin: "cloud", connectionId: "", provider: "github", ref: "", name: "" };
  }
}

/** A fresh source for the file origin's other payload kind (mode switch). */
export function defaultFileSource(kind: "text" | "archive"): OriginSource {
  return kind === "archive"
    ? { origin: "file", kind: "archive", file: null, name: "" }
    : { origin: "file", kind: "text", content: "", format: "tree" };
}

/** Step 1 → step 2 gate: is the source complete enough to configure? */
export function isSourceReady(source: OriginSource): boolean {
  switch (source.origin) {
    case "folder":
      return true;
    case "file": {
      // Archive mode is ready the moment a file is picked — nothing to decode.
      if (source.kind === "archive") return source.file !== null;
      if (source.content.trim().length === 0) return false;
      // A non-export CSV needs a usable column mapping before step 2 can run —
      // our own export carries its header and needs none. The guess is the
      // same one the mapper UI pre-fills, so the gate and the parser agree.
      if (source.format === "csv") {
        const headers = parseCsvRows(source.content)[0] ?? [];
        if (!isExportCsv(headers)) {
          return isCsvMappingUsable(source.csvMapping ?? guessCsvMapping(headers));
        }
      }
      return true;
    }
    case "url":
      return isValidHttpUrl(source.url);
    case "cloud":
      return source.connectionId !== "" && source.ref !== "";
  }
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function isGitHubUrl(value: string): boolean {
  try {
    return new URL(value.trim()).hostname === "github.com";
  } catch {
    return false;
  }
}

/**
 * Auto-hide toast notes shared by all import actions. The 20ms wait lets the
 * layout pass compute autoHideCount after setGraph before we read it.
 */
export async function collectAutoHideNotes(): Promise<
  { title: string; description: string }[]
> {
  await new Promise((r) => setTimeout(r, 20));
  const { autoHideCount, autoHideThreshold } = useGraphStore.getState();
  if (autoHideCount <= 0) return [];
  return [
    {
      title: "Large folders collapsed",
      description: `${autoHideCount} item${autoHideCount === 1 ? " was" : "s were"} auto-hidden (folders with more than ${autoHideThreshold} children). Use Hidden Cards in the sidebar to reveal them.`,
    },
  ];
}

/** Human-readable source description for the step-3 summary. */
export function sourceLabel(source: OriginSource): string {
  switch (source.origin) {
    case "folder":
      return "Device folder (picker opens on import)";
    case "file": {
      if (source.kind === "archive") {
        return source.file
          ? `${source.name} (${formatBytes(source.file.size)})`
          : "No archive selected";
      }
      const n = source.content.trim().split("\n").length;
      return `${source.format.toUpperCase()} payload, ${n} line${n === 1 ? "" : "s"}`;
    }
    case "url":
      return source.url.trim();
    case "cloud":
      return source.name || source.ref;
  }
}

/** Shared catch tail for the step-3 import actions: normalize a thrown error
 *  into a failed ImportActionResult. */
export function importFailure(err: unknown, title = "Import failed"): ImportActionResult {
  return {
    ok: false,
    title,
    error: err instanceof Error ? err.message : "Unknown error",
  };
}