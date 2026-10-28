/**
 * File import action (step 3 of the unified import flow) — a thin re-export.
 *
 * The implementation lives in `fileOriginImport.ts`: `importAction.test.ts`
 * mocks THIS path to assert origin dispatch, and bun's `mock.module` registry
 * is process-wide, so anything testing the real action imports the other module
 * (T-145). Keep this file as the mock seam and nothing else.
 */
export { runFileImport } from "./fileOriginImport";
