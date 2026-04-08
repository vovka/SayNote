create table if not exists user_review_cursors (
  user_id uuid primary key,
  cursor_after_note_id uuid,
  updated_at timestamptz not null default now()
);

alter table user_review_cursors enable row level security;

drop policy if exists "users_manage_own_review_cursor" on user_review_cursors;

create policy "users_manage_own_review_cursor"
  on user_review_cursors
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
