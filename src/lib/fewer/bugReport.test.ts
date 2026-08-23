import { describe, expect, test } from "bun:test";
import {
  buildGitHubIssueBody,
  buildGitHubIssueUrl,
  type BugReport,
} from "./bugReport";

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
    byCategory: {},
    hiddenNodes: 1,
    layoutDirection: "TB",
    edgeStyle: "smoothstep",
    nodeWidth: 200,
    nodeHeight: 60,
    themeMode: "dark",
  },
  bug: {
    title: "Nodes overlap",
    description: "It breaks.",
    stepsToReproduce: "1. Open\n2. Break",
    severity: "high",
    category: "layout",
  },
});

describe("buildGitHubIssueUrl", () => {
  test("points at new-issue endpoint with encoded title", () => {
    const url = buildGitHubIssueUrl(baseReport());
    expect(url.startsWith("https://github.com/qvesera/fewer/issues/new?")).toBe(true);
    expect(url).toContain(encodeURIComponent("[Bug] Nodes overlap"));
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
    expect(body).toContain("| Nodes | 3 |");
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
    expect(body).toContain("| Nodes | 0 |");
    expect(body).toContain("| Layout | unknown |");
    expect(body).toContain("| Online | No |");
  });
});