import "server-only";
// Named re-exports keep this shim opaque to bun's module-mock registry (a
// mock of this file must never bleed into ./registryCore — T-211).
// The adapter map lives in registryCore.ts (no server-only) so its tests run
// regardless of which files mocked what earlier (T-201).
export { getAdapter, isProviderImplemented, __overrideGetAdapterForTests } from "./registryCore";
export type {
  CloudProviderAdapter,
  CloudProvider,
  CloudEntry,
  CloudListResult,
} from "./types";
