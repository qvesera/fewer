import { describe, expect, test } from "bun:test";
import {
  buildGitHubIssueBody,
  buildGitHubIssueUrl,
  collectDiagnostics,
  buildBugReport,
  bugReportFilename,
  web3FormsKeyIsUsable,
  buildWeb3FormsPayload,
  web3FormsErrorMessage,
  SEVERITIES,
  CATEGORIES,
  NO_TITLE,
  NO_DESCRIPTION,
  NO_STEPS,
  type BugReport,
  type BugSeverity,
  type BugCategory,
} from "./bugReport";

// ── Helpers ─────────────────────────────────────────────────────────────

const baseEnv = () => ({
  userAgent: "test-agent",
  isBrave: true,
  hasFileSystemAccess: true,
  isIframe: false,
  viewportWidth: 1920,
  viewportHeight: 1080,
  online: true,
});

const baseGraph = () => ({
  nodes: [
    { length: 1, data: { type: "file", size: 50, category: "code" } },
    { length: 1, data: { type: "file", size: 50, category: "config" } },
    { length: 1, data: { type: "folder" } },
  ] as any,
  edges: [{ length: 1 }, { length: 1 }] as any,
  hiddenIds: { length: 1 } as any,
  direction: "TB",
  edgeStyle: "smoothstep",
  nodeWidth: 200,
  nodeHeight: 60,
  themeMode: "dark",
});

const baseReport = (): BugReport => ({
  app: { name: "fewer", version: "1.0.0", timestamp: "2026-01-01T00:00:00.000Z" },
  environment: {
    userAgent: "test-agent",
    browser: "Brave",
    fileSystemAccess: "Supported",
    iframeContext: false,
    viewport: "1920x1080",
    online: true,
  },
  graphState: {
    totalNodes: 3,
    totalEdges: 2,
    totalFiles: 2,
    totalFolders: 1,
    totalSize: 100,
    byCategory: { code: 1, config: 1, image: 0, document: 0, archive: 0, data: 0, media: 0, binary: 0, text: 0 },
    hiddenNodes: 1,
    layoutDirection: "TB",
    edgeStyle: "smoothstep",
    nodeWidth: 200,
    nodeHeight: 60,
    themeMode: "dark",
  },
  bug: {
    title: "Cards overlap",
    description: "It breaks.",
    stepsToReproduce: "1. Open\n2. Break",
    severity: "high",
    category: "layout",
  },
});

// ── collectDiagnostics ──────────────────────────────────────────────────

describe("collectDiagnostics", () => {
  test("computes graph stats from nodes/edges", () => {
    const r = collectDiagnostics({ env: baseEnv(), graph: baseGraph() });
    expect(r.graphState!.totalNodes).toBe(3);
    expect(r.graphState!.totalEdges).toBe(2);
    expect(r.graphState!.totalFiles).toBe(2);
    expect(r.graphState!.totalFolders).toBe(1);
    expect(r.graphState!.totalSize).toBe(100);
    expect(r.graphState!.hiddenNodes).toBe(1);
  });

  test("folds byCategory from file nodes", () => {
    const r = collectDiagnostics({ env: baseEnv(), graph: baseGraph() });
    expect(r.graphState!.byCategory.code).toBe(1);
    expect(r.graphState!.byCategory.config).toBe(1);
    expect(r.graphState!.byCategory.image).toBe(0);
  });

  test("echoes layout/edge/dims/theme", () => {
    const r = collectDiagnostics({ env: baseEnv(), graph: baseGraph() });
    expect(r.graphState!.layoutDirection).toBe("TB");
    expect(r.graphState!.edgeStyle).toBe("smoothstep");
    expect(r.graphState!.nodeWidth).toBe(200);
    expect(r.graphState!.nodeHeight).toBe(60);
    expect(r.graphState!.themeMode).toBe("dark");
  });

  test("maps env fields: Brave, FS supported, viewport, online", () => {
    const r = collectDiagnostics({ env: baseEnv(), graph: baseGraph() });
    expect(r.environment!.browser).toBe("Brave");
    expect(r.environment!.fileSystemAccess).toBe("Supported");
    expect(r.environment!.viewport).toBe("1920x1080");
    expect(r.environment!.online).toBe(true);
  });

  test("non-Brave maps to Unknown", () => {
    const r = collectDiagnostics({ env: { ...baseEnv(), isBrave: false }, graph: baseGraph() });
    expect(r.environment!.browser).toBe("Unknown");
  });

  test("no FS access maps to Not supported", () => {
    const r = collectDiagnostics({ env: { ...baseEnv(), hasFileSystemAccess: false }, graph: baseGraph() });
    expect(r.environment!.fileSystemAccess).toBe("Not supported");
  });

  test("iframe true", () => {
    const r = collectDiagnostics({ env: { ...baseEnv(), isIframe: true }, graph: baseGraph() });
    expect(r.environment!.iframeContext).toBe(true);
  });

  test("offline", () => {
    const r = collectDiagnostics({ env: { ...baseEnv(), online: false }, graph: baseGraph() });
    expect(r.environment!.online).toBe(false);
  });

  test("uses provided now for timestamp", () => {
    const fixed = new Date("2026-03-15T12:00:00Z");
    const r = collectDiagnostics({ env: baseEnv(), graph: baseGraph(), now: fixed });
    expect(r.app!.timestamp).toBe("2026-03-15T12:00:00.000Z");
  });

  test("all-falsy env still yields complete object", () => {
    const r = collectDiagnostics({
      env: { userAgent: "", isBrave: false, hasFileSystemAccess: false, isIframe: false, viewportWidth: 0, viewportHeight: 0, online: false },
      graph: baseGraph(),
    });
    expect(r.environment!.browser).toBe("Unknown");
    expect(r.environment!.viewport).toBe("0x0");
    expect(r.environment!.online).toBe(false);
    expect(r.app!.name).toBe("fewer");
  });
});

// ── buildBugReport ──────────────────────────────────────────────────────

describe("buildBugReport", () => {
  test("trims whitespace from title/description/steps", () => {
    const r = buildBugReport(baseReport(), {
      title: "  Hello  ",
      description: "  world  ",
      steps: "  1. do this  ",
      severity: "medium",
      category: "other",
    });
    expect(r.bug.title).toBe("Hello");
    expect(r.bug.description).toBe("world");
    expect(r.bug.stepsToReproduce).toBe("1. do this");
  });

  test("empty title → NO_TITLE sentinel", () => {
    const r = buildBugReport(baseReport(), {
      title: "", description: "", steps: "",
      severity: "low", category: "ui",
    });
    expect(r.bug.title).toBe(NO_TITLE);
    expect(r.bug.description).toBe(NO_DESCRIPTION);
    expect(r.bug.stepsToReproduce).toBe(NO_STEPS);
  });

  test("provided values preserved", () => {
    const r = buildBugReport(baseReport(), {
      title: "Fix", description: "Bug", steps: "1",
      severity: "critical", category: "performance",
    });
    expect(r.bug.severity).toBe("critical");
    expect(r.bug.category).toBe("performance");
  });

  test("diagnostics preserved", () => {
    const diag = baseReport();
    const r = buildBugReport(diag, {
      title: "x", description: "y", steps: "z",
      severity: "low", category: "other",
    });
    expect(r.graphState).toBe(diag.graphState);
    expect(r.environment).toBe(diag.environment);
  });
});

// ── Sentinel↔markdown coupling regression ───────────────────────────────

describe("sentinel↔markdown coupling", () => {
  test("empty form sentinels render correctly in issue body", () => {
    const report = buildBugReport(baseReport(), {
      title: "", description: "", steps: "",
      severity: "high", category: "layout",
    });
    const body = buildGitHubIssueBody(report);
    expect(body).toContain("_No description provided._");
    expect(body).toContain("No steps provided.");
  });

  test("provided values render in issue body", () => {
    const report = buildBugReport(baseReport(), {
      title: "Title", description: "My desc", steps: "1. Step",
      severity: "high", category: "layout",
    });
    const body = buildGitHubIssueBody(report);
    expect(body).toContain("My desc");
    expect(body).toContain("1. Step");
  });
});

// ── web3Forms helpers ───────────────────────────────────────────────────

describe("web3FormsKeyIsUsable", () => {
  test("undefined → false", () => expect(web3FormsKeyIsUsable(undefined)).toBe(false));
  test("placeholder → false", () => expect(web3FormsKeyIsUsable("YOUR_WEB3FORMS_KEY_HERE")).toBe(false));
  test("real key → true", () => expect(web3FormsKeyIsUsable("abc123")).toBe(true));
});

describe("buildWeb3FormsPayload", () => {
  test("includes access_key, subject, from_name, message", () => {
    const report = baseReport();
    const payload = buildWeb3FormsPayload(report, "k123");
    expect(payload.access_key).toBe("k123");
    expect(payload.subject).toBe("[Bug Report] Cards overlap");
    expect(payload.from_name).toBe("fewer Bug Reporter");
    const parsed = JSON.parse(payload.message);
    expect(parsed.bug.title).toBe("Cards overlap");
    expect(parsed.graphState.totalNodes).toBe(3);
  });
});

describe("web3FormsErrorMessage", () => {
  test("success → null", () => {
    expect(web3FormsErrorMessage(true, { success: true })).toBeNull();
  });
  test("ok but !success → fallback", () => {
    expect(web3FormsErrorMessage(true, { success: false })).toBe("Failed to submit bug report via Web3Forms.");
  });
  test("!ok with message → message", () => {
    expect(web3FormsErrorMessage(false, { message: "Rate limited" })).toBe("Rate limited");
  });
  test("!ok no message → fallback", () => {
    expect(web3FormsErrorMessage(false, {})).toBe("Failed to submit bug report via Web3Forms.");
  });
  test("!ok null data → fallback", () => {
    expect(web3FormsErrorMessage(false, null)).toBe("Failed to submit bug report via Web3Forms.");
  });
});

// ── bugReportFilename ───────────────────────────────────────────────────

describe("bugReportFilename", () => {
  test("returns correct format", () => {
    expect(bugReportFilename(1234567890)).toBe("fewer-bug-report-1234567890.json");
  });
});

// ── CATEGORIES / SEVERITIES integrity ───────────────────────────────────

describe("CATEGORIES", () => {
  test("every BugCategory has exactly one entry", () => {
    const cats: BugCategory[] = [
      "layout", "import", "export", "resize", "theme", "context-menu",
      "keyboard", "search", "drag-drop", "file-ops", "ui", "performance", "other",
    ];
    for (const c of cats) {
      expect(CATEGORIES.filter((e) => e.value === c).length).toBe(1);
    }
    expect(CATEGORIES.length).toBe(cats.length);
  });

  test("labels are unique", () => {
    const labels = CATEGORIES.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("SEVERITIES", () => {
  test("every BugSeverity has exactly one entry", () => {
    const sevs: BugSeverity[] = ["low", "medium", "high", "critical"];
    for (const s of sevs) {
      expect(SEVERITIES.filter((e) => e.value === s).length).toBe(1);
    }
    expect(SEVERITIES.length).toBe(sevs.length);
  });

  test("labels are unique", () => {
    const labels = SEVERITIES.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// ── buildGitHubIssueUrl (existing, preserved) ───────────────────────────

describe("buildGitHubIssueUrl", () => {
  test("points at new-issue endpoint with encoded title", () => {
    const url = buildGitHubIssueUrl(baseReport());
    expect(url.startsWith("https://github.com/qvesera/fewer/issues/new?")).toBe(true);
    expect(url).toContain(encodeURIComponent("[Bug] Cards overlap"));
  });

  test("body contains all sections and populated values", () => {
    const body = decodeURIComponent(
      buildGitHubIssueUrl(baseReport()).split("&body=")[1] ?? "",
    );
    for (const section of [
      "### Description",
      "### Steps to Reproduce",
      "### Details",
      "<summary><b>System Diagnostics</b></summary>",
      "<summary><b>Graph State</b></summary>",
      "<summary><b>Raw JSON Payload</b></summary>",
    ]) {
      expect(body).toContain(section);
    }
    expect(body).toContain("| Browser | Brave |");
    expect(body).toContain("| Cards | 3 |");
    expect(body).toContain("- **Severity**: `high`");
    expect(body).toContain("It breaks.");
  });

  test("defaults applied for sentinel description/steps", () => {
    const report = baseReport();
    report.bug.description = "(no description provided)";
    report.bug.stepsToReproduce = "(no steps provided)";
    const body = buildGitHubIssueBody(report);
    expect(body).toContain("_No description provided._");
    expect(body).toContain("No steps provided.");
  });

  test("missing optional sections fall back safely", () => {
    const report = baseReport();
    delete report.app;
    delete report.environment;
    delete report.graphState;
    const body = buildGitHubIssueBody(report);
    expect(body).toContain("| App Name | fewer |");
    expect(body).toContain("| Browser | unknown |");
    expect(body).toContain("| Iframe | No |");
    expect(body).toContain("| Cards | 0 |");
    expect(body).toContain("| Layout | unknown |");
    expect(body).toContain("| Online | No |");
  });
});
