/**
 * Shared contract for the unified 3-step import flow:
 * step 1 select origin → step 2 configure options → step 3 import.
 * The options panel (ImportOptionsPanel) is identical for every origin;
 * only the import action changes per origin.
 */
import type { CloudProvider } from "@/lib/fewer/cloud/types";
import { useGraphStore } from "@/store/graphStore";

export type ImportOrigin = "folder" | "file" | "url" | "cloud";

export type FileImportFormat = "json" | "tree" | "script";

/** What the user picked in step 1 for the active origin. */
export type OriginSource =
  | { origin: "folder" }
  | { origin: "file"; content: string; format: FileImportFormat }
  | { origin: "url"; url: string; watch: boolean }
  | {
      origin: "cloud";
      connectionId: string;
      provider: CloudProvider;
      ref: string;
      name: string;
    };

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

export const ORIGIN_META: Record<
  ImportOrigin,
  { label: string; blurb: string }
> = {
  folder: { label: "Folder", blurb: "Scan a directory on this device" },
  file: { label: "File", blurb: "ASCII tree, JSON graph, or shell script" },
  url: { label: "URL", blurb: "GitHub repo or public file index" },
  cloud: { label: "Cloud", blurb: "Linked cloud account (read-only)" },
};

export function defaultSourceFor(origin: ImportOrigin): OriginSource {
  switch (origin) {
    case "folder":
      return { origin: "folder" };
    case "file":
      return { origin: "file", content: "", format: "tree" };
    case "url":
      return { origin: "url", url: "", watch: false };
    case "cloud":
      return { origin: "cloud", connectionId: "", provider: "github", ref: "", name: "" };
  }
}

/** Step 1 → step 2 gate: is the source complete enough to configure? */
export function isSourceReady(source: OriginSource): boolean {
  switch (source.origin) {
    case "folder":
      return true;
    case "file":
      return source.content.trim().length > 0;
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
      const n = source.content.trim().split("\n").length;
      return `${source.format.toUpperCase()} payload, ${n} line${n === 1 ? "" : "s"}`;
    }
    case "url":
      return source.url.trim();
    case "cloud":
      return source.name || source.ref;
  }
}