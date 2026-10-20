// Registry core (T-201): the adapter map without the `server-only` guard.
// Split out so registry.test.ts can exercise it directly — bun mocks are
// process-wide, and a mock.module("./registry", …) in another file (server.test.ts)
// used to leak into registry.test.ts whenever the runner evaluated that file first.
// registry.ts keeps the server-only guard and re-exports this module.

import type { CloudProvider, CloudProviderAdapter } from "./types";
import { githubAdapter } from "./providers/github";
import { googleDriveAdapter } from "./providers/google";
import {
  onedriveAdapter,
  sharepointAdapter,
  azureDevOpsAdapter,
  azureBlobAdapter,
} from "./providers/microsoft";

// ponytail: static imports — dynamic import() of alias paths is not resolvable
// at runtime under Next's server bundler (MODULE_NOT_FOUND).
const ADAPTERS: Partial<Record<CloudProvider, CloudProviderAdapter>> = {
  github: githubAdapter,
  "google-drive": googleDriveAdapter,
  onedrive: onedriveAdapter,
  sharepoint: sharepointAdapter,
  "azure-devops": azureDevOpsAdapter,
  "azure-blob": azureBlobAdapter,
};

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

/**
 * Test-only override (T-211): bun's module-mock registry is process-wide AND
 * order-sensitive on CI (a mock of a re-exporting file can alias onto the
 * module behind it), so server.test.ts injects its stub through this seam
 * instead of mocking the module. Never set in production code.
 */
let adapterOverride: ((provider: CloudProvider) => Promise<CloudProviderAdapter>) | null = null;
export function __overrideGetAdapterForTests(
  fn: ((provider: CloudProvider) => Promise<CloudProviderAdapter>) | null,
): void {
  adapterOverride = fn;
}

export async function getAdapter(provider: CloudProvider): Promise<CloudProviderAdapter> {
  if (adapterOverride) return adapterOverride(provider);
  return ADAPTERS[provider] ?? notConfigured(provider);
}

/** Whether a provider has a registered adapter implementation. */
export function isProviderImplemented(provider: CloudProvider): boolean {
  return provider in ADAPTERS;
}

export type { CloudProvider, CloudProviderAdapter, CloudEntry, CloudListResult } from "./types";