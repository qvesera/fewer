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
    ["Nodes", String(graphState?.totalNodes ?? 0)],
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
    report.bug.description !== "(no description provided)"
      ? report.bug.description
      : "_No description provided._",
    "",
    "### Steps to Reproduce",
    "",
    "```",
    report.bug.stepsToReproduce !== "(no steps provided)"
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