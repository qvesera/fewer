import "server-only";
import type { CloudProvider, CloudProviderAdapter } from "./types";

// Configured adapters: provider id → module + named export.
const ADAPTERS: Partial<Record<CloudProvider, { mod: string; exp: string }>> = {
  github: { mod: "@/lib/fewer/cloud/providers/github", exp: "githubAdapter" },
  "google-drive": { mod: "@/lib/fewer/cloud/providers/google", exp: "googleDriveAdapter" },
  onedrive: { mod: "@/lib/fewer/cloud/providers/microsoft", exp: "onedriveAdapter" },
  sharepoint: { mod: "@/lib/fewer/cloud/providers/microsoft", exp: "sharepointAdapter" },
  "azure-devops": { mod: "@/lib/fewer/cloud/providers/microsoft", exp: "azureDevOpsAdapter" },
  "azure-blob": { mod: "@/lib/fewer/cloud/providers/microsoft", exp: "azureBlobAdapter" },
};

const cache = new Map<CloudProvider, CloudProviderAdapter>();

function notConfigured(provider: CloudProvider): CloudProviderAdapter {
  const fail = () => {
    throw new Error(`${provider} is not implemented yet`);
  };
  return {
    id: provider,
    label: provider,
    buildAuthUrl: fail,
    exchangeCode: fail,
    async refreshToken() {
      return null;
    },
    listChildren: fail,
  };
}

/** Load a provider adapter (lazy via dynamic import). */
export async function getAdapter(provider: CloudProvider): Promise<CloudProviderAdapter> {
  const cached = cache.get(provider);
  if (cached) return cached;
  const entry = ADAPTERS[provider];
  let adapter: CloudProviderAdapter;
  if (entry) {
    const m = await import(entry.mod);
    adapter = (m[entry.exp] as CloudProviderAdapter) ?? notConfigured(provider);
  } else {
    adapter = notConfigured(provider);
  }
  cache.set(provider, adapter);
  return adapter;
}

/** Whether a provider has a registered adapter implementation. */
export function isProviderImplemented(provider: CloudProvider): boolean {
  return provider in ADAPTERS;
}

export type { CloudProvider, CloudProviderAdapter, CloudEntry, CloudListResult } from "./types";