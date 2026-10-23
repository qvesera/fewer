import type { ImportActionResult } from "./importFlow";
import { useGraphStore } from "@/store/graphStore";

/**
 * "Open Folder" one-shot action (T-199): runs the folder import straight
 * through the native picker — no 3-step dialog. Shared by the sidebar's
 * primary button and the empty-canvas quick action; both toast the result.
 * Returns `null` when the picker was cancelled (nothing to announce).
 */
export async function openFolderAction(): Promise<ImportActionResult | null> {
  const store = useGraphStore.getState();
  store.setLoading(true);
  try {
    const { runFolderImport } = await import("./importActionFolder");
    const result = await runFolderImport(store.importOptions);
    return result.cancelled ? null : result;
  } finally {
    useGraphStore.getState().setLoading(false);
  }
}