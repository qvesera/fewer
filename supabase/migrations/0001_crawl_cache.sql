-- Crawl cache: stores crawled public file index trees keyed by URL.
-- TTL handled in app code (expires_at); a row is "fresh" while now < expires_at.

create table if not exists public.crawl_cache (
  url text primary key,
  tree jsonb not null,
  source text not null,
  truncated boolean not null default false,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Allow anonymous reads/writes so the server-side publishable key can
-- read + upsert cache rows without auth. The publishable key is not
-- secret; the cache is non-sensitive public data.
alter table public.crawl_cache enable row level security;

drop policy if exists "crawl_cache_select" on public.crawl_cache;
create policy "crawl_cache_select" on public.crawl_cache
  for select using (true);

drop policy if exists "crawl_cache_insert" on public.crawl_cache;
create policy "crawl_cache_insert" on public.crawl_cache
  for insert with check (true);

drop policy if exists "crawl_cache_update" on public.crawl_cache;
create policy "crawl_cache_update" on public.crawl_cache
  for update using (true) with check (true);

create index if not exists crawl_cache_expires_idx on public.crawl_cache (expires_at);