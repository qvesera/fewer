import "server-only";
// The adapter map lives in registryCore.ts (no server-only) so its tests can
// run regardless of which files mocked './registry' earlier in the process (T-201).
export * from "./registryCore";
