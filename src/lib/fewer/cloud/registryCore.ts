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

export async function getAdapter(provider: CloudProvider): Promise<CloudProviderAdapter> {
  return ADAPTERS[provider] ?? notConfigured(provider);
}

/** Whether a provider has a registered adapter implementation. */
export function isProviderImplemented(provider: CloudProvider): boolean {
  return provider in ADAPTERS;
}

export type { CloudProvider, CloudProviderAdapter, CloudEntry, CloudListResult } from "./types";