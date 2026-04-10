create extension if not exists "pgcrypto";

create table if not exists user_profiles (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  display_name text,
  email text
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  parent_id uuid references categories(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  path_cache text,
  normalized_path_cache text not null,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_recording_id text not null,
  idempotency_key text not null,
  status text not null,
  audio_storage_key text,
  audio_mime_type text not null,
  audio_duration_ms integer,
  retry_count integer not null default 0,
  error_code text,
  error_message_safe text,
  provider_used text,
  transcription_model text,
  categorization_model text,
  client_created_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  category_id uuid not null constraint notes_category_id_fkey references categories(id) on delete cascade,
  source_job_id uuid not null unique references processing_jobs(id),
  text text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists user_review_cursors (
  user_id uuid primary key,
  cursor_after_note_id uuid,
  updated_at timestamptz not null default now()
);

create table if not exists user_ai_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  encrypted_api_key text not null,
  key_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists user_ai_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  primary_provider text not null,
  transcription_model text not null,
  categorization_model text not null,
  fallback_provider text,
  fallback_transcription_model text,
  fallback_categorization_model text,
  fallback_on_terminal_primary_failure boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_credential_update_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now()
);

alter table categories drop constraint if exists categories_user_id_parent_id_name_key;

create unique index if not exists categories_user_parent_normalized_name_unique_idx
  on categories (user_id, parent_id, normalized_name) nulls not distinct;

create index if not exists ai_credential_update_attempts_user_id_created_at_idx
  on ai_credential_update_attempts (user_id, created_at desc);
create index if not exists categories_user_id_idx on categories (user_id);
create index if not exists processing_jobs_user_id_idx on processing_jobs (user_id);
create index if not exists notes_user_id_idx on notes (user_id);

alter table user_profiles enable row level security;
alter table categories enable row level security;
alter table processing_jobs enable row level security;
alter table notes enable row level security;
alter table ai_credential_update_attempts enable row level security;
alter table user_ai_credentials enable row level security;
alter table user_ai_config enable row level security;
alter table user_review_cursors enable row level security;

create policy "users_manage_own_profile" on user_profiles using (id = auth.uid()) with check (id = auth.uid());
create policy "users_manage_own_categories" on categories using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users_read_own_jobs" on processing_jobs for select using (user_id = auth.uid());
create policy "users_read_own_notes" on notes for select using (user_id = auth.uid());
create policy "users_manage_own_ai_config" on user_ai_config using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users_manage_own_review_cursor" on user_review_cursors using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on user_ai_credentials from authenticated;
grant select (provider, key_fingerprint, created_at, updated_at) on user_ai_credentials to authenticated;

comment on column processing_jobs.client_created_at is
  'Client-captured creation timestamp. Historical rows are backfilled from created_at as fallback semantics.';
