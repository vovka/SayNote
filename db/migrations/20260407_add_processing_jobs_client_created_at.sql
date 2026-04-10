-- Add canonical client-created timestamp for uploads.
-- Backfill policy: for all existing rows, copy processing_jobs.created_at.
-- Fallback semantics: if historical rows predate this column, client_created_at
-- mirrors server created_at after backfill and remains immutable thereafter.

alter table processing_jobs
  add column if not exists client_created_at timestamptz;

update processing_jobs
set client_created_at = created_at
where client_created_at is null;

alter table processing_jobs
  alter column client_created_at set not null,
  alter column client_created_at set default now();

comment on column processing_jobs.client_created_at is
  'Client-captured creation timestamp. Historical rows are backfilled from created_at; downstream consumers may treat backfilled values as server-time fallback.';
