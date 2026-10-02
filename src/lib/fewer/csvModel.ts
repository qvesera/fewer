/**
 * CSV column-mapping model — shared by the CSV importer (`parsers.parseCSVGraph`)
 * and the column mapper in the import flow's file step. Pure: no DOM, no store,
 * so the UI can read headers while the parser resolves rows through the very
 * same helpers. A single definition keeps "what the UI offers" and "what the
 * parser understands" from drifting apart.
 */

/** Sentinel for a column the user has not mapped. */
export const UNMAPPED = -1;

/** Which CSV column plays which role. Indices, not names: the UI owns the header list. */
export interface CsvColumnMap {
  /** Column holding the display name. Required. */
  name: number;
  path: number;
  type: number;
  extension: number;
  symlinkTarget: number;
  parent: number;
}

/** Field order the mapper renders, in one place so UI and parser cannot disagree. */
export const CSV_MAPPING_FIELDS = [
  "name",
  "path",
  "type",
  "extension",
  "symlinkTarget",
  "parent",
] as const satisfies readonly (keyof CsvColumnMap)[];

export type CsvMappingField = (typeof CSV_MAPPING_FIELDS)[number];

/** Human label per mapping field, for the mapper's selects. */
export const CSV_FIELD_LABELS: Record<CsvMappingField, string> = {
  name: "Name",
  path: "Path",
  type: "Type",
  extension: "Extension",
  symlinkTarget: "Symlink target",
  parent: "Parent",
};

export function emptyCsvMapping(): CsvColumnMap {
  return {
    name: UNMAPPED,
    path: UNMAPPED,
    type: UNMAPPED,
    extension: UNMAPPED,
    symlinkTarget: UNMAPPED,
    parent: UNMAPPED,
  };
}

/** Header cell → comparable key ("Full Path" → "fullpath"). */
function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Header aliases per role. Compared after normalizeHeader, so "Parent ID",
 * "parent_id" and "parentid" all match. Order within a field is the match
 * priority; the first unclaimed column wins.
 */
const CSV_HEADER_ALIASES: Record<CsvMappingField, string[]> = {
  name: ["label", "name", "title", "filename", "file", "entry", "nodename"],
  path: ["path", "fullpath", "filepath", "relpath", "fullpathname", "location"],
  type: ["type", "kind", "nodetype", "entrytype"],
  extension: ["extension", "ext", "suffix"],
  symlinkTarget: ["symlinktarget", "symlink", "linktarget", "link", "target"],
  parent: ["parent", "parentid", "parentpath", "parentname"],
};

/** Headers of the CSV export — the shape the importer takes with zero mapping. */
export const CSV_EXPORT_HEADERS = [
  "id",
  "label",
  "path",
  "type",
  "extension",
  "category",
  "size_bytes",
  "symlink_target",
];

/**
 * True when the rows look exactly like our own CSV export (the first 8 columns
 * in order), so the importer can run with no column mapping at all.
 */
export function isExportCsv(headers: string[]): boolean {
  const norm = headers.slice(0, CSV_EXPORT_HEADERS.length).map(normalizeHeader);
  return (
    norm.length === CSV_EXPORT_HEADERS.length &&
    norm.every((h, i) => h === normalizeHeader(CSV_EXPORT_HEADERS[i]!))
  );
}

/**
 * Guess a mapping from the header row: first unclaimed alias per role. A lone
 * column with no matching header still maps to name — a plain list of paths is
 * a valid CSV people actually paste.
 */
export function guessCsvMapping(headers: string[]): CsvColumnMap {
  const map = emptyCsvMapping();
  const claimed = new Set<number>();
  for (const field of CSV_MAPPING_FIELDS) {
    for (let i = 0; i < headers.length; i++) {
      if (claimed.has(i)) continue;
      if (CSV_HEADER_ALIASES[field].includes(normalizeHeader(headers[i] ?? ""))) {
        map[field] = i;
        claimed.add(i);
        break;
      }
    }
  }
  if (headers.length === 1 && map.name === UNMAPPED) map.name = 0;
  return map;
}

/** A mapping is usable when at least the name column is set. */
export function isCsvMappingUsable(map: CsvColumnMap): boolean {
  return map.name >= 0;
}

/**
 * Quote-aware CSV row split. The exporter quotes fields containing `"`/`\n`/
 * `,` and doubles inner quotes, so a naive line split breaks on exactly the
 * rows that matter — this walks the text instead. Strips a UTF-8 BOM (Excel).
 */
export function parseCsvRows(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }

  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Cell of a row at `index`, "" when the row is short or the column unmapped. */
export function cell(row: string[], index: number): string {
  return index < 0 ? "" : (row[index] ?? "").trim();
}