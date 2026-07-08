import type { FileCategory } from "./types";

const EXTENSION_MAP: Record<string, FileCategory> = {
  // code
  ts: "code",
  tsx: "code",
  js: "code",
  jsx: "code",
  mjs: "code",
  cjs: "code",
  py: "code",
  rb: "code",
  go: "code",
  rs: "code",
  java: "code",
  kt: "code",
  swift: "code",
  c: "code",
  h: "code",
  cpp: "code",
  cs: "code",
  php: "code",
  sh: "code",
  bash: "code",
  zsh: "code",
  // config
  json: "config",
  yaml: "config",
  yml: "config",
  toml: "config",
  ini: "config",
  env: "config",
  xml: "config",
  conf: "config",
  // image
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  ico: "image",
  bmp: "image",
  // document
  md: "document",
  txt: "document",
  pdf: "document",
  doc: "document",
  docx: "document",
  rtf: "document",
  // archive
  zip: "archive",
  tar: "archive",
  gz: "archive",
  rar: "archive",
  "7z": "archive",
  // data
  csv: "data",
  tsv: "data",
  sql: "data",
  db: "data",
  sqlite: "data",
  // media
  mp4: "media",
  mkv: "media",
  mov: "media",
  avi: "media",
  mp3: "media",
  wav: "media",
  flac: "media",
  ogg: "media",
  // binary
  exe: "binary",
  bin: "binary",
  dll: "binary",
  so: "binary",
  dylib: "binary",
  wasm: "binary",
  // text (fallback)
  log: "text",
  css: "text",
  scss: "text",
  html: "text",
  htm: "text",
};

export function categorizeByExtension(ext: string): FileCategory {
  if (!ext) return "text";
  const normalized = ext.toLowerCase().replace(/^\./, "");
  return EXTENSION_MAP[normalized] ?? "text";
}

export function getFileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) return "";
  return name.slice(lastDot + 1).toLowerCase();
}

export function isHiddenName(name: string): boolean {
  return name.startsWith(".");
}
