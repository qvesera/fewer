interface HandlerEvent {
  httpMethod: string;
  body: string | null;
  [key: string]: any;
}

interface HandlerResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;

  if (!GITHUB_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server Configuration Error: GITHUB_TOKEN is not set." }),
    };
  }

  const repo = GITHUB_REPO || "qvesera/fewer";

  try {
    const body = JSON.parse(event.body || "{}");
    const { report } = body;

    if (!report || !report.bug) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Bad Request: Missing bug report payload." }),
      };
    }

    const { bug, environment, graphState, app } = report;

    // Format GitHub issue markdown body
    const issueBody = `
### Description
${bug.description || "_No description provided._"}

### Steps to Reproduce
\`\`\`
${bug.stepsToReproduce || "No steps provided."}
\`\`\`

### Details
- **Severity**: \`${bug.severity}\`
- **Category**: \`${bug.category}\`

<details>
<summary><b>System Diagnostics</b></summary>

| Metric | Value |
| --- | --- |
| **App Name** | ${app?.name || "fewer"} |
| **App Version** | ${app?.version || "1.0.0"} |
| **Timestamp** | ${app?.timestamp || new Date().toISOString()} |
| **User Agent** | ${environment?.userAgent || "unknown"} |
| **Browser** | ${environment?.browser || "unknown"} |
| **File System Access** | ${environment?.fileSystemAccess || "unknown"} |
| **Iframe Context** | ${environment?.iframeContext ? "Yes" : "No"} |
| **Viewport** | ${environment?.viewport || "unknown"} |
| **Online Status** | ${environment?.online ? "Online" : "Offline"} |

</details>

<details>
<summary><b>Graph State Diagnostics</b></summary>

| Metric | Value |
| --- | --- |
| **Total Nodes** | ${graphState?.totalNodes ?? 0} |
| **Total Edges** | ${graphState?.totalEdges ?? 0} |
| **Total Files** | ${graphState?.totalFiles ?? 0} |
| **Total Folders** | ${graphState?.totalFolders ?? 0} |
| **Total Size (Bytes)** | ${graphState?.totalSize ?? 0} |
| **Hidden Nodes** | ${graphState?.hiddenNodes ?? 0} |
| **Layout Direction** | ${graphState?.layoutDirection || "unknown"} |
| **Edge Style** | ${graphState?.edgeStyle || "unknown"} |
| **Theme Mode** | ${graphState?.themeMode || "unknown"} |

</details>

<details>
<summary><b>Full Raw JSON Payload</b></summary>

\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`

</details>
    `.trim();

    // Make API request to GitHub
    const githubUrl = `https://api.github.com/repos/${repo}/issues`;
    const response = await fetch(githubUrl, {
      method: "POST",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "fewer-bug-report-system",
      },
      body: JSON.stringify({
        title: `[Bug] ${bug.title || "Untitled Bug Report"}`,
        body: issueBody,
        labels: ["bug", `severity:${bug.severity}`, `category:${bug.category}`],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: `GitHub API error: ${response.statusText}`,
          details: errorText,
        }),
      };
    }

    const issueData = await response.json();
    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        issueUrl: issueData.html_url,
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal Server Error",
        details: error.message || error,
      }),
    };
  }
};
