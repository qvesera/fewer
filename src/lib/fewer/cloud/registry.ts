import "server-only";
// Named re-exports, NOT `export *`: bun's mock.module registry aliases a
// whole-module mock of this file onto the module behind a star re-export, so
// a mock of "./registry" (server.test.ts) used to bleed into later imports of
// "./registryCore" on CI's file order. Named bindings keep the shim opaque.
// The adapter map itself lives in registryCore.ts (no server-only) so its
// tests can run regardless of which files mocked what earlier (T-201/T-208).
export { getAdapter, isProviderImplemented } from "./registryCore";
export type {
  CloudProviderAdapter,
  CloudProvider,
  CloudEntry,
  CloudListResult,
} from "./types";
