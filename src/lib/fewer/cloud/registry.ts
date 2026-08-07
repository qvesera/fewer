import "server-only";
import type { CloudProvider, CloudProviderAdapter } from "./types";

// Configured adapters: add new providers here as they land.
const ADAPTERS: Partial<Record<CloudProvider, string>> = {
  github: "@/lib/fewer/cloud/providers/github",
};

const cache = new Map<CloudProvider, CloudProviderAdapter | null>();

function notConfigured(provider: CloudProvider): CloudProviderAdapter {
  return {
    id: provider,
    label: provider,
    async buildAuthUrl() {
      throw new Error(`${provider} is not configured yet`);
    },
    async exchangeCode() {
      throw new Error(`${provider} is not configured yet`);
    },
    async refreshToken() {
      return null;
    },
    async listChildren() {
      throw new Error(`${provider} is not configured yet`);
    },
  };
}

/** Load a provider adapter (lazy via dynamic import). */
export async function getAdapter(provider: CloudProvider): Promise<CloudProviderAdapter> {
  if (cache.has(provider)) return cache.get(provider)!;
  const mod = ADAPTERS[provider];
  let adapter: CloudProviderAdapter;
  if (mod) {
    const m = await import(mod);
    adapter = m[`${provider}Adapter`] as CloudProviderAdapter;
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