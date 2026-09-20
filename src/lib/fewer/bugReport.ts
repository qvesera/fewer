import { computeStats } from "./stats";

// ── Vocabulary ──────────────────────────────────────────────────────────

export type BugSeverity = "low" | "medium" | "high" | "critical";
export type BugCategory =
  | "layout"
  | "import"
  | "export"
  | "resize"
  | "theme"
  | "context-menu"
  | "keyboard"
  | "search"
  | "drag-drop"
  | "file-ops"
  | "ui"
  | "performance"
  | "other";

export const SEVERITIES: { value: BugSeverity; label: string; color: string }[] = [
  { value: "low", label: "Low: minor inconvenience", color: "text-blue-500" },
  { value: "medium", label: "Medium: workaround exists", color: "text-yellow-600 dark:text-yellow-500" },
  { value: "high", label: "High: feature broken", color: "text-orange-600 dark:text-orange-500" },
  { value: "critical", label: "Critical: app unusable", color: "text-red-600 dark:text-red-500" },
];

export const CATEGORIES: { value: BugCategory; label: string }[] = [
  { value: "layout", label: "Layout / Beautify" },
  { value: "import", label: "Import / File System" },
  { value: "export", label: "Export" },
  { value: "resize", label: "Card Resizing" },
  { value: "theme", label: "Theme / Colors" },
  { value: "context-menu", label: "Context Menu" },
  { value: "keyboard", label: "Keyboard Shortcuts" },
  { value: "search", label: "Search" },
  { value: "drag-drop", label: "Drag & Drop" },
  { value: "file-ops", label: "File Operations" },
  { value: "ui", label: "UI / Visual" },
  { value: "performance", label: "Performance" },
  { value: "other", label: "Other" },
];

// ── Sentinels ───────────────────────────────────────────────────────────

export const NO_TITLE = "(no title provided)";
export const NO_DESCRIPTION = "(no description provided)";
export const NO_STEPS = "(no steps provided)";

// ── Bug report shape ────────────────────────────────────────────────────

export interface BugReport {
  app?: {
    name: string;
    version: string;
    timestamp: string;
  };
  environment?: {
    userAgent: string;
    browser: string;
    fileSystemAccess: string;
    iframeContext: boolean;
    viewport: string;
    online: boolean;
  };
  graphState?: {
    totalNodes: number;
    totalEdges: number;
    totalFiles: number;
    totalFolders: number;
    totalSize: number;
    byCategory: Record<string, number>;
    hiddenNodes: number;
    layoutDirection: string;
    edgeStyle: string;
    nodeWidth: number;
    nodeHeight: number;
    themeMode: string;
  };
  bug: {
    title: string;
    description: string;
    stepsToReproduce: string;
    severity: string;
    category: string;
  };
}

// ── Diagnostics collection ──────────────────────────────────────────────

export interface BrowserEnv {
  userAgent: string;
  isBrave: boolean;
  hasFileSystemAccess: boolean;
  isIframe: boolean;
  viewportWidth: number;
  viewportHeight: number;
  online: boolean;
}

export interface GraphInput {
  nodes: { length: number; data: { type: string; size?: number; category?: string } }[];
  edges: { length: number }[];
  hiddenIds: { length: number };
  direction: string;
  edgeStyle: string;
  nodeWidth: number;
  nodeHeight: number;
  themeMode: string;
}

export interface DiagnosticsInput {
  env: BrowserEnv;
  graph: GraphInput;
  now?: Date;
}

export interface BugReportDiagnostics {
  app: { name: string; version: string; timestamp: string };
  environment: { userAgent: string; browser: string; fileSystemAccess: string; iframeContext: boolean; viewport: string; online: boolean };
  graphState: { totalNodes: number; totalEdges: number; totalFiles: number; totalFolders: number; totalSize: number; byCategory: Record<string, number>; hiddenNodes: number; layoutDirection: string; edgeStyle: string; nodeWidth: number; nodeHeight: number; themeMode: string };
}

/**
 * Pure diagnostics collector. The component reads browser globals and feeds
 * them in as `env`, so this function stays branch-free and testable.
 */
export function collectDiagnostics(input: DiagnosticsInput): BugReportDiagnostics {
  const { env, graph, now } = input;
  const stats = computeStats(graph.nodes as any, graph.edges as any);

  return {
    app: {
      name: "fewer",
      version: "1.0.0",
      timestamp: (now ?? new Date()).toISOString(),
    },
    environment: {
      userAgent: env.userAgent,
      browser: env.isBrave ? "Brave" : "Unknown",
      fileSystemAccess: env.hasFileSystemAccess ? "Supported" : "Not supported",
      iframeContext: env.isIframe,
      viewport: `${env.viewportWidth}x${env.viewportHeight}`,
      online: env.online,
    },
    graphState: {
      totalNodes: graph.nodes.length,
      totalEdges: graph.edges.length,
      totalFiles: stats.totalFiles,
      totalFolders: stats.totalFolders,
      totalSize: stats.totalSize,
      byCategory: stats.byCategory,
      hiddenNodes: graph.hiddenIds.length,
      layoutDirection: graph.direction,
      edgeStyle: graph.edgeStyle,
      nodeWidth: graph.nodeWidth,
      nodeHeight: graph.nodeHeight,
      themeMode: graph.themeMode,
    },
  };
}

// ── Report builder ──────────────────────────────────────────────────────

export interface BugForm {
  title: string;
  description: string;
  steps: string;
  severity: string;
  category: string;
}

/** Merge diagnostics with user input, applying sentinels for empty fields. */
export function buildBugReport(
  diagnostics: BugReportDiagnostics | BugReport,
  form: BugForm,
): BugReport {
  return {
    ...diagnostics,
    bug: {
      title: form.title.trim() || NO_TITLE,
      description: form.description.trim() || NO_DESCRIPTION,
      stepsToReproduce: form.steps.trim() || NO_STEPS,
      severity: form.severity,
      category: form.category,
    },
  };
}

// ── Download filename ───────────────────────────────────────────────────

export function bugReportFilename(nowMs: number): string {
  return `fewer-bug-report-${nowMs}.json`;
}

// ── Web3Forms helpers ───────────────────────────────────────────────────

export function web3FormsKeyIsUsable(key: string | undefined): boolean {
  return !!key && key !== "YOUR_WEB3FORMS_KEY_HERE";
}

export function buildWeb3FormsPayload(
  report: BugReport,
  key: string,
): Record<string, string> {
  return {
    access_key: key,
    subject: `[Bug Report] ${report.bug.title}`,
    from_name: "fewer Bug Reporter",
    message: JSON.stringify(report, null, 2),
  };
}

export function web3FormsErrorMessage(
  ok: boolean,
  data: { success?: boolean; message?: string } | null,
): string | null {
  if (ok && data?.success) return null;
  return data?.message ?? "Failed to submit bug report via Web3Forms.";
}

// ── GitHub issue helpers ────────────────────────────────────────────────

const GITHUB_REPO = "qvesera/fewer";

/** Two-column GitHub markdown table from [label, value] rows. */
function mdTable(rows: [string, string][]): string {
  return ["| Metric | Value |", "| --- | --- |", ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join("\n");
}

/** Wrap content in a collapsible <details> block. */
function detailsBlock(summary: string, content: string): string {
  return `<details>\n<summary><b>${summary}</b></summary>\n\n${content}\n</details>`;
}

/** Build the markdown issue body for a bug report. */
export function buildGitHubIssueBody(report: BugReport): string {
  const { environment, graphState, app } = report;

  const diagnosticsRows: [string, string][] = [
    ["App Name", app?.name || "fewer"],
    ["App Version", app?.version || "1.0.0"],
    ["Timestamp", app?.timestamp || new Date().toISOString()],
    ["Browser", environment?.browser || "unknown"],
    ["FS Access", environment?.fileSystemAccess || "unknown"],
    ["Iframe", environment?.iframeContext ? "Yes" : "No"],
    ["Viewport", environment?.viewport || "unknown"],
    ["Online", environment?.online ? "Yes" : "No"],
  ];

  const graphStateRows: [string, string][] = [
    ["Cards", String(graphState?.totalNodes ?? 0)],
    ["Edges", String(graphState?.totalEdges ?? 0)],
    ["Files", String(graphState?.totalFiles ?? 0)],
    ["Folders", String(graphState?.totalFolders ?? 0)],
    ["Size (Bytes)", String(graphState?.totalSize ?? 0)],
    ["Hidden", String(graphState?.hiddenNodes ?? 0)],
    ["Layout", graphState?.layoutDirection || "unknown"],
    ["Edge Style", graphState?.edgeStyle || "unknown"],
    ["Theme", graphState?.themeMode || "unknown"],
  ];

  return [
    "### Description",
    "",
    report.bug.description !== NO_DESCRIPTION
      ? report.bug.description
      : "_No description provided._",
    "",
    "### Steps to Reproduce",
    "",
    "```",
    report.bug.stepsToReproduce !== NO_STEPS
      ? report.bug.stepsToReproduce
      : "No steps provided.",
    "```",
    "",
    "### Details",
    "",
    `- **Severity**: \`${report.bug.severity}\``,
    `- **Category**: \`${report.bug.category}\``,
    `- **App Version**: ${app?.version || "1.0.0"}`,
    "",
    detailsBlock("System Diagnostics", mdTable(diagnosticsRows)),
    "",
    detailsBlock("Graph State", mdTable(graphStateRows)),
    "",
    detailsBlock("Raw JSON Payload", `\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\``),
  ].join("\n");
}

/** Build a pre-filled GitHub "new issue" URL for the report. */
export function buildGitHubIssueUrl(report: BugReport): string {
  const title = `[Bug] ${report.bug.title}`;
  return `https://github.com/${GITHUB_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(buildGitHubIssueBody(report))}`;
}