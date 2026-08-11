-- Cloud provider connections (OAuth account linking).
-- Each row = one linked cloud account for one user. Access/refresh tokens are
-- AES-256-GCM encrypted server-side (CONNECTIONS_ENCRYPTION_KEY) and never
-- exposed to the client. RLS: owner only.

create table if not exists public.cloud_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in (
    'github', 'google-drive', 'onedrive', 'sharepoint', 'azure-devops', 'azure-blob'
  )),
  -- Provider account identifier (github login, drive email, AD account, ...)
  account_id text not null,
  -- Human display name for the linked account
  account_name text not null default '',
  -- Encrypted access token (AES-256-GCM)
  access_token_enc text not null,
  -- Encrypted refresh token (nullable for providers without refresh tokens)
  refresh_token_enc text,
  -- Token expiry (UTC) if the provider issues expiring tokens
  expires_at timestamptz,
  -- Provider-specific config (azure blob account name, sharepoint site id, ...)
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One linked account per provider per user
  unique (user_id, provider, account_id)
);

alter table public.cloud_connections enable row level security;

drop policy if exists "cloud_connections_select" on public.cloud_connections;
create policy "cloud_connections_select" on public.cloud_connections
  for select using (auth.uid() = user_id);

drop policy if exists "cloud_connections_insert" on public.cloud_connections;
create policy "cloud_connections_insert" on public.cloud_connections
  for insert with check (auth.uid() = user_id);

drop policy if exists "cloud_connections_update" on public.cloud_connections;
create policy "cloud_connections_update" on public.cloud_connections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "cloud_connections_delete" on public.cloud_connections;
create policy "cloud_connections_delete" on public.cloud_connections
  for delete using (auth.uid() = user_id);

create index if not exists cloud_connections_user_idx on public.cloud_connections (user_id);

-- Auto-update updated_at on save.
drop trigger if exists cloud_connections_set_updated_at on public.cloud_connections;
create trigger cloud_connections_set_updated_at
  before update on public.cloud_connections
  for each row execute function public.set_updated_at();