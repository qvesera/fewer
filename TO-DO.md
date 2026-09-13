# TO-DO

Blog-post backlog. Major features merged to `dev` get a one-line entry here (see `.clinerules/pr-dev-checks.md`). Remove entry when the post ships to `content/blog/`.

<!-- Format: - [ ] YYYY-MM-DD · feature name · PR #n -->

## To write

- [ ] 2026-08-19 · Account plans (Free/Pro/Team): server-side entitlements, plan column + enforcement · PR #61 — **blocked**: self-serve billing is unshipped (`BILLING_ENABLED=false`, `/docs/plans` unpublished). Write it when checkout goes live.
- [ ] 2026-08-18 · v0.5.0 leftovers: file-type filters + cloud-synced settings & custom themes · 0.5.0 — two small features, one combined post.
- [ ] 2026-09-12 · v0.7.x maintenance: `profiles` grants security fix, migration verify/apply CI pipeline · PR #85–#116 — optional; only if the migration rules deserve a write-up.

## Housekeeping

- [ ] Back-export the three posts that exist only in the database (`v031-performance`, `v040-accounts`, `v050-remote-sources`) into `content/blog/`, so `scripts/gen-seed-content.py` covers every row in `content_pages`.

# Archive (written)

- [x] 2026-09-12 · v0.6.0: community gallery, version history, unified 3-step import, accounts upgrade · `content/blog/v060-release.md`
- [x] 2026-09-05 · Tags — colored highlight rings per tag, tag filtering, tag sort · `content/docs/graph-features.md#tags` (documented, no post)
- [x] 2026-08-18 · v0.5.0: Open/Download remote sources — GitHub repos & crawled file indexes · `content/blog/v050-remote-sources.md` (DB-only)
- [x] 2026-08-10 · v0.4.0: Accounts & authentication, saved graphs, selective sharing, theme/settings sync · `content/blog/v040-accounts.md` (DB-only)
- [x] 2026-08-08 · v0.3.x: Bundle slimming + dialogs lazy-loaded (~300KB lighter startup) · `content/blog/v031-performance.md` (DB-only)
- [x] 2026-08-06 · v0.3.0: Theme Engine, 18 presets, lighter bundle · `content/blog/v030-release.md`
- [x] 2026-08-05 · Aurora Haze theme · `content/blog/aurora-haze-theme.md`
- [x] 2026-08-03 · Custom ELK layout engine · `content/blog/elk-layout-engine.md`
- [x] 2026-08-01 · First release · `content/blog/first-release.md`
