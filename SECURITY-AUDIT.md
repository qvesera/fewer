# fewer — Source-First Security Audit

**Task:** T-225 (internal, research) — `SECURITY-AUDIT.md`
**Scope:** `src/`, `supabase/migrations/`, `middleware.ts`, `next.config.ts`, `netlify.toml`, `Caddyfile`
**Method:** Read-only static source review only. No target code was built, run, or probed
(outside a sandbox there is no safe way to execute the app or run a network-dependent
dependency audit — see **Needs validation** below). The audit describes fixes; it does not
modify target source.

## Executive summary

No critical or high findings. The strongest controls are in the right places: Stripe
webhooks verify signatures, `profiles.plan` is protected by column-level grants on top of
owner-only RLS, share invite resolution uses a `SECURITY DEFINER` function that does not
loosen RLS, OAuth state is bound to `httpOnly SameSite=Lax` cookies, and exported SVG
escapes all user-controlled text.

One medium finding: `POST /api/crawl` is an unauthenticated server-side fetcher for
arbitrary http/https URLs (SSRF). Low/informational findings cover the localhost-gated
local-dev path APIs, share payloads containing local file paths, error echo, missing
security headers, and a committed dev publishable key.

## Findings

### F-1 (medium) — SSRF via POST /api/crawl

**Evidence.** `src/app/api/crawl/route.ts` accepts any `url` whose protocol is `http:` or
`https:` (`isValidHttpUrl`, route.ts:15-22) and fetches it server-side through
`crawlTree` → `fetchEntries` (route.ts:64, crawl.ts:15-33). `fetchEntries` uses
`redirect: "follow"` (crawl.ts:23), so an attacker-supplied URL that redirects to an
internal host is followed too. There is **no authentication** on the route, no host or
port allowlist, no private-IP/link-local/metadata blocking, and results are returned to
the caller. Crawl results are also written to `crawl_cache` keyed by URL
(route.ts:96-109), so an attacker who crawls a URL first controls what later callers see
for that URL (cache poisoning).

**Principal / resource / outcome.** Unauthenticated actor → the server's outbound network
(localhost, link-local, cloud metadata where available) → read-only server-side fetches
with attacker-controlled URLs; response bodies reflected back via the API.

**Severity.** Medium: a real boundary violation (server-side network access is not a
surface the app should expose to unauthenticated input), read-only, blast radius limited
to what the server can reach. Escalates toward high if the host exposes an IMDS or
internal services with sensitive endpoints.

**Fix.** Require authentication on the route and scope fetches to an explicit allowlist
of hosts/schemes; block private, link-local, and metadata ranges before and after
redirects (or disable redirect following / pin to the same host); rate-limit per
authenticated user; do not reflect raw fetched bodies to callers (return only the parsed
tree).

**Status: fixed** (commit `eea2706`, task T-226) — outbound guard rejects
private/reserved IPv4+IPv6 and unresolvable hostnames (every DNS answer screened),
redirects followed manually with an 8-hop cap so each target is guarded, discovered
links screened before entering the tree, per-client rate limit (10/min → 429). Host
allowlisting and authentication were deliberately not added (guest imports stay
working); DNS-rebinding between check and connect remains a residual, documented in
`crawlGuard.ts`.

### F-2 (low) — Local-dev path APIs gated by hostname only

**Evidence.** `POST /api/open-file`, `/api/open-folder`, `/api/list-directory`,
`/api/resolve-path` are protected solely by `requireLocalhost` (openInOs.ts:177-199), a
hostname check (`localhost`, `127.0.0.1`, `::1`). `resolveLocalPath` returns *any*
existing absolute path on the server (openInOs.ts:160-163), and `openInOs` hands that
path to the OS default handler (`open` / `xdg-open` / `cmd start`) as an argument-array
entry (no shell, so no shell injection — openInOs.ts:224-227).

**Residual risk.** Directly exposed production traffic could bypass the check via
Host-header/DNS-rebinding, and arbitrary file types can be opened in the server user's
applications (local information disclosure). These helpers are dev tools and are not
meant for production exposure (Netlify standalone would never see `Host: localhost`).

**Fix.** Gate the routes behind a dev-only flag (e.g. only enabled outside production),
keep `requireLocalhost`, and prefer resolving under configured roots even for absolute
paths. Document that they must never be exposed on a public host.

**Status: fixed** (task T-227) — `requireLocalhost` now returns 403 for every host when
`NODE_ENV === "production"` unless `ENABLE_LOCAL_PATH_API=true`; hostname check unchanged
otherwise. Resolving arbitrary absolute paths (when explicitly enabled) is unchanged —
acceptable for an opt-in local tool, documented in `.env.example`.

### F-3 (low/informational) — Public share rows are fully readable; payloads carry local paths

**Evidence.** `supabase/migrations/0002_shared_graphs.sql:13-15`: `shared_graphs_select`
policy is `using (true)` (intended — "anyone with the link"). Migration 0012 hardened
UPDATE/DELETE to owner-only but left SELECT public. Share ids are
`randomBytes(6).toString("base64url")` (~8 chars, ≈48 bits; src/app/api/share/route.ts:221).
The `data` jsonb payload contains the full graph, including `data.path` local filesystem
paths when the graph was imported from disk — so sharing a link publishes the sharer's
directory structure/pathnames to anyone who guesses or obtains the id.

**Fix.** Product guidance: share links publish the graph contents — tell users before
they share graphs imported from local disk. Defense: lengthen share ids
(`randomBytes(12)`) and consider stripping `localRootPath`/local paths from the share
payload or warning the user.

### F-4 (informational) — Errors echo raw internals to clients

**Evidence.** `src/lib/fewer/apiHelpers.ts:6-11` `serverError` returns `err.message`
verbatim with a 500; route catch blocks surface DB/Stripe/fetch details
(crawl/route.ts:71-73, share/route.ts catch, etc.). Can expose schema names, Supabase
project details, or provider error text.

**Fix.** Return generic messages for 500s in production; log details server-side.

**Status: addressed** (task T-227) — `serverError`/`apiErrorMessage` return
`Internal server error` in production (logging the detail) and every API route's 500
path now routes through them, including the Supabase `error.message` sites. Left as-is
by design: the `/api/cloud/connect|callback` error redirects (authenticated UX, messages
are static or provider OAuth error codes) and server-side `console.warn` logging.

### F-5 (informational) — No CSP / X-Frame-Options configured

**Evidence.** `next.config.ts` sets no response headers; `netlify.toml` has no
`[[headers]]` block; no CSP/X-Frame-Options in `src/`. Share and gallery pages carry
user actions (unshare, delete) with no clickjacking mitigation at the app level.

**Fix.** Add `X-Frame-Options: SAMEORIGIN` (or DENY for embedded contexts) and a
baseline CSP via `next.config.headers` or Netlify `[[headers]]`.

**Status: partially addressed** (task T-227) — `X-Frame-Options: SAMEORIGIN`,
`X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`
added in `next.config.ts`. CSP deferred: Next's inline scripts make a correct policy a
separate change.

## Notes (no finding)

- `netlify.toml` commits the **dev** Supabase publishable key for preview/branch deploys
  (lines 27-28, 33-34). Publishable keys are non-secret by design (they ship in the
  browser); service-role keys correctly come only from Netlify dashboard env vars.
- `.env` / `.env.local` exist in the working tree (mode 600) — confirm they are gitignored
  before any commit.

## Controls verified (no findings)

- Stripe webhook: `stripe.webhooks.constructEventAsync` signature verification before any
  DB write (src/app/api/billing/webhook/route.ts:28); plan writes use the service-role
  client (billing.ts:38-43).
- `profiles.plan` / `stripe_customer_id` are service-role-only via column-level grants
  (migrations 0022, 0026, 0030) plus owner-only RLS (0019).
- Share invite flow: `SECURITY DEFINER` `get_shared_graph_by_token` (0009) with execute
  granted only to `anon`/`authenticated`; invite-only read requires a JWT email match
  (src/app/api/share/[id]/route.ts:45-53); invite tokens are 192-bit random
  (share/route.ts:74).
- OAuth cloud connectors: `state` + `provider` in `httpOnly SameSite=Lax` cookies,
  verified on callback (src/app/api/cloud/connect/route.ts, callback/route.ts); OAuth
  tokens encrypted at rest with AES-256-GCM, key validated as 32-byte base64
  (src/lib/fewer/cloud/crypto.ts).
- SVG export escapes all user-controlled text (`escapeXml` on labels, metrics, colors,
  branding host — src/lib/fewer/graphRenderer.ts); font CSS is CDATA-wrapped and fetched
  same-origin (src/lib/fewer/exportFont.ts).
- Shared text validator used client and server (src/lib/fewer/textValidation.ts); gallery
  category allowlist (gallery/route.ts:24-26); billing disabled by default (503 without
  `BILLING_ENABLED=true` + Stripe vars).

## Needs validation (blocker — cannot run without a sandbox)

The audit environment cannot enforce the skill's execution controls (isolated loopback
namespace, empty allowlisted env, read-only target, resource limits), so target code was
not built or run and no live endpoints were probed. Before merging, run:

1. `bun audit` (lockfile present: `bun.lock`) — dependency vulnerability scan.
2. `python3 scripts/migrations.py verify --base origin/dev` — migration hygiene (local,
   safe to run now).
3. Dynamic confirmation of F-1 against a controlled local listener (SSRF + redirect
   following + cache poisoning).
4. Security-header check (CSP / X-Frame-Options) against the production/preview deploy.
5. Confirm `.env` / `.env.local` are covered by `.gitignore`.

The audit scaffold referenced by the security-audit skill
(`report-schema.json`, `validate-findings.cjs`, `validate-coverage-ledger.cjs`,
`RECONNAISSANCE.md`…) does not exist in this repo, so findings are recorded here rather
than in a machine-validated `findings.json`.