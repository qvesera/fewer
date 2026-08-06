# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x     | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue in fewer, please report it privately before disclosing it publicly.

**To report a vulnerability:**

1. **Open a draft security advisory** at [github.com/qvesera/fewer/security/advisories/new](https://github.com/qvesera/fewer/security/advisories/new)
2. Alternatively, email the maintainers directly (check commit history for contact)

### What to include

- A clear description of the vulnerability
- Steps to reproduce (if applicable)
- Potential impact
- Any suggested fixes (optional)

### Response timeline

- **48 hours**: Acknowledgment of your report
- **7 days**: Initial assessment and plan
- **30 days**: Fix or mitigation (depending on complexity)

We will keep you informed of progress throughout the process.

## Scope

fewer is a client-side browser application. Security considerations include:

- **File System Access API**: The app reads directory structures from the user's file system. It does not transmit file contents to any server.
- **Local storage**: Graph state is stored in the browser only. No data is sent to external services.
- **Minimal backend**: fewer is primarily client-side. Server-side routes include `/api/github-tree` (fetches public GitHub repo trees), `/api/crawl` (crawls public Apache/nginx file indexes), and `/api/open-folder` (local dev helper). A Prisma + SQLite database is used for app metadata. Optional Supabase integration provides accounts, saved graphs, crawl caching, and server-backed share links. Directory contents are only transmitted when you explicitly save or share a graph.

## Safe Usage

- fewer runs entirely in your browser by default: no data leaves your machine
- Imported directory structures and file metadata are never uploaded unless you explicitly save or share a graph
- Export operations (SVG, PNG, JSON, CSV, DOT, scripts, tree) produce local files only
- The app does not collect telemetry, analytics, or usage statistics
- Saved graphs and share links are stored in Supabase and protected by row-level security; invite-only shares require a signed-in user with an invited email

## Responsible Disclosure

We ask that you:

- Give us reasonable time to fix the issue before public disclosure
- Make a good-faith effort to avoid privacy violations, data destruction, or service disruption
- Do not exploit the vulnerability beyond what is necessary to demonstrate the issue

Thank you for helping keep fewer and its users safe.
