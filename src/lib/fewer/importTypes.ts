/**
 * The import vocabulary shared by the flow, the detector and the options
 * panel — the neutral home that breaks two loops of the seven-file module
 * cycle: both closed through importFlow's type edges (importDetect →
 * importFlow for FileImportFormat, importOptions → importFlow for
 * ImportOrigin). Type-first, no runtime imports of either side.
 */

export type ImportOrigin = "folder" | "file" | "url" | "cloud";

/** The text formats the file origin can parse, in the order the panel lists them. */
export const FILE_IMPORT_FORMATS = ["tree", "json", "script", "csv", "dot"] as const;

export type FileImportFormat = (typeof FILE_IMPORT_FORMATS)[number];
