# Implementation Plan

[Overview]
Add dual-trigger bug report submission to the fewer app: email via Web3Forms (client-side, no backend) and GitHub Issues via Netlify serverless function (keeps PAT server-side).

The existing `BugReportDialog.tsx` already collects comprehensive diagnostics (graph state, environment, user input) and has Copy JSON + Download Report buttons. This plan adds two new submission buttons that send the same JSON report to either Web3Forms (email) or a Netlify serverless function (GitHub issue creation). Both options are always visible. The Netlify function keeps the GitHub PAT server-side, never exposed to the client. Web3Forms uses a public access key (safe for client-side). Both approaches are fully compatible with Netlify's Next.js plugin and serverless functions.

[Types]

No new types needed in the main app. The bug report object structure is already defined inline in `BugReportDialog.tsx` as a `useMemo` return. The Netlify function will define its own request/response types.

**BugReportPayload** (existing, in BugReportDialog.tsx):
```typescript
{
  app: { name: string; version: string; timestamp: string };
  environment: { userAgent: string; browser: string; fileSystemAccess: string; iframeContext: boolean; viewport: string; online: boolean };
  graphState: { totalNodes: number; totalEdges: number; totalFiles: number; totalFolders: number; totalSize: number; byCategory: Record<string, number>; hiddenNodes: number; layoutDirection: string; edgeStyle: string; nodeWidth: number; nodeHeight: number; themeMode: string };
  bug: { title: string; description: string; stepsToReproduce: string; severity: string; category: string };
}
```

**Netlify function types** (in `netlify/functions/bug-report.ts`):
```typescript
interface BugReportRequest {
  report: typeof BugReportPayload;
}

interface BugReportResponse {
  success: boolean;
  issueUrl?: string;
  error?: string;
}
```

[Files]

**New files:**
- `netlify/functions/bug-report.ts` — Netlify serverless function. Receives POST with bug report JSON, creates GitHub issue in `qvesera/fewer` repo using `GITHUB_TOKEN` env var. Returns issue URL.
- `.env.example` — Documents all required env vars with placeholder values.

**Modified files:**
- `src/components/fewer/BugReportDialog.tsx` — Add two new buttons: "Send Email" (Web3Forms) and "Create GitHub Issue" (calls Netlify function). Add submission state management (loading, success, error). Add toast notifications.
- `netlify.toml` — Add `[functions]` section pointing to `netlify/functions` directory (if not auto-detected by plugin).

**No files deleted or moved.**

[Functions]

**New functions:**
1. `submitToWeb3Forms(report: BugReportPayload): Promise<{ success: boolean; error?: string }>` — in `BugReportDialog.tsx`. POSTs to `https://api.web3forms.com/submit` with `access_key` from `process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY`. Sends report as JSON in `from_name`, `subject`, and `message` fields.

2. `submitToGitHub(report: BugReportPayload): Promise<{ success: boolean; issueUrl?: string; error?: string }>` — in `BugReportDialog.tsx`. POSTs to `/.netlify/functions/bug-report` with `{ report }` body. Returns issue URL on success.

3. `handler(event: HandlerEvent): Promise<HandlerResponse>` — in `netlify/functions/bug-report.ts`. Netlify serverless function. Reads `GITHUB_TOKEN` and `GITHUB_REPO` from `process.env`. Formats bug report as GitHub issue body (markdown). Creates issue via `POST https://api.github.com/repos/{owner}/{repo}/issues`. Adds labels: `bug`, severity, category.

**Modified functions:**
- `BugReportDialog` component — add `submitting` state (`"idle" | "email" | "github"`), `handleSubmitEmail`, `handleSubmitGitHub` handlers. Add two buttons in `DialogFooter` before existing Copy/Download buttons. Disable all buttons during submission. Show toast on success/failure.

**No functions removed.**

[Classes]

No classes modified or created. All changes are function-level.

[Dependencies]

**No new npm packages required.**

- Web3Forms: uses standard `fetch` API, no SDK needed.
- GitHub Issues: uses standard `fetch` API in the serverless function, no `@octokit/rest` needed (raw REST API call is simpler and lighter).
- Netlify functions: TypeScript support is built into `@netlify/plugin-nextjs` v5+.

**Environment variables:**
- `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY` — client-side, placeholder: `YOUR_WEB3FORMS_KEY_HERE`
- `GITHUB_TOKEN` — server-side only, never exposed to client. User's PAT with `repo` scope.
- `GITHUB_REPO` — server-side, value: `qvesera/fewer`

[Testing]

No automated test files in this project (no test framework configured). Manual testing approach:

1. **Web3Forms test**: Set `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY` to a real key from web3forms.com. Open bug report dialog, fill form, click "Send Email". Verify email arrives with JSON report.
2. **GitHub Issues test**: Set `GITHUB_TOKEN` and `GITHUB_REPO` in Netlify env vars (or local `.env`). Deploy to Netlify. Open bug report dialog, fill form, click "Create GitHub Issue". Verify issue appears in `qvesera/fewer` repo with correct labels.
3. **Error handling test**: Remove env vars, attempt submission. Verify graceful error toast appears.
4. **Build test**: Run `npm run build:netlify` to verify Netlify function compiles and Next.js build succeeds.

[Implementation Order]

1. Create `.env.example` with all three env vars and placeholder values.
2. Create `netlify/functions/bug-report.ts` serverless function.
3. Update `netlify.toml` to ensure functions directory is recognized (add `[functions]` section if needed).
4. Modify `src/components/fewer/BugReportDialog.tsx`:
   - Add submission state (`submitting: "idle" | "email" | "github"`)
   - Add `submitToWeb3Forms` function
   - Add `submitToGitHub` function
   - Add "Send Email" button with Mail icon
   - Add "Create GitHub Issue" button with GitHub icon (use `Github` from lucide-react)
   - Add toast notifications for success/error
   - Disable all buttons during submission
5. Verify build: `npm run build:netlify`
6. Document env var setup in README or separate setup guide.