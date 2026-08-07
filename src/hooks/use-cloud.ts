"use client";

import { useCallback, useEffect, useState } from "react";
import type { CloudConnection, CloudEntry, CloudProvider } from "@/lib/fewer/cloud/types";

export const PROVIDER_LABELS: Record<CloudProvider, string> = {
  github: "GitHub",
  "google-drive": "Google Drive",
  onedrive: "OneDrive",
  sharepoint: "SharePoint",
  "azure-devops": "Azure DevOps",
  "azure-blob": "Azure Blob",
};

/** Providers with a working adapter. */
export const AVAILABLE_PROVIDERS: CloudProvider[] = [
  "github",
  "google-drive",
  "onedrive",
  "sharepoint",
  "azure-devops",
  "azure-blob",
];

/** Fetch the current user's linked cloud connections. */
export function useConnections() {
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cloud/connections");
      if (res.status === 401) {
        setConnections([]);
        return;
      }
      if (!res.ok) throw new Error("Failed to load connections");
      const json = await res.json();
      setConnections(json.connections ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { connections, loading, error, refresh };
}

/** Start the OAuth link flow for a provider (redirects to provider consent). */
export function connectProvider(provider: CloudProvider) {
  window.location.href = `/api/cloud/connect?provider=${encodeURIComponent(provider)}`;
}

/** Unlink a cloud connection. */
export async function unlinkConnection(id: string): Promise<boolean> {
  try {
    const res = await fetch("/api/cloud/connections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** List immediate children of a cloud folder. */
export async function listCloudFolder(
  connectionId: string,
  provider: CloudProvider,
  ref?: string,
): Promise<{ entries: CloudEntry[]; rootRef?: string; rootName?: string }> {
  const res = await fetch("/api/cloud/list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, provider, ref }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to list folder");
  return json;
}

/** Build a TreeEntry subtree for a cloud folder (graph import). */
export async function buildCloudTree(
  connectionId: string,
  provider: CloudProvider,
  ref: string,
  depth = 6,
) {
  const res = await fetch("/api/cloud/tree", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, provider, ref, depth }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to build tree");
  return json.tree;
}

/** Open a cloud entry in the provider's web UI (new tab). */
export function openCloudUrl(webUrl?: string) {
  if (!webUrl) return;
  window.open(webUrl, "_blank", "noopener,noreferrer");
}