#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
DB_DIR="$ROOT_DIR/db"
MIGRATIONS_DIR="$DB_DIR/migrations"
SCHEMA_FILE="$DB_DIR/schema.sql"
COMMAND="${1:-migrate}"

load_env() {
  if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ROOT_DIR/.env"
    set +a
  fi

  : "${DATABASE_URL:?DATABASE_URL is required. Set it in the shell or in $ROOT_DIR/.env.}"
}

run_psql() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 "$@"
}

ensure_migrations_table() {
  run_psql <<'SQL'
create table if not exists schema_migrations (
  name text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);
SQL
}

file_checksum() {
  sha256sum "$1" | awk '{print $1}'
}

applied_checksum() {
  name="$1"
  run_psql -Atqc "select checksum from schema_migrations where name = '$name' limit 1"
}

assert_no_drift() {
  file_path="$1"
  name="$(basename "$file_path")"
  checksum="$(file_checksum "$file_path")"
  recorded="$(applied_checksum "$name")"

  if [ -n "$recorded" ] && [ "$recorded" != "$checksum" ]; then
    echo "[db_runner_failed] Applied migration checksum mismatch: $name" >&2
    exit 1
  fi
}

apply_schema() {
  run_psql -f "$SCHEMA_FILE"
  echo "[applied] db/schema.sql"
}

record_migration() {
  file_path="$1"
  name="$(basename "$file_path")"
  checksum="$(file_checksum "$file_path")"

  run_psql <<SQL
insert into schema_migrations (name, checksum)
values ('$name', '$checksum')
on conflict (name) do update set checksum = excluded.checksum;
SQL
}

bootstrap() {
  apply_schema
  ensure_migrations_table

  for file_path in "$MIGRATIONS_DIR"/*.sql; do
    [ -e "$file_path" ] || continue
    assert_no_drift "$file_path"
    record_migration "$file_path"
  done

  echo "[done] Bootstrapped schema and recorded migration history."
}

migrate() {
  ensure_migrations_table

  for file_path in "$MIGRATIONS_DIR"/*.sql; do
    [ -e "$file_path" ] || continue
    assert_no_drift "$file_path"

    local_name="$(basename "$file_path")"
    if [ -n "$(applied_checksum "$local_name")" ]; then
      echo "[skip] $local_name"
      continue
    fi

    local_checksum="$(file_checksum "$file_path")"
    run_psql <<SQL
begin;
\i $file_path
insert into schema_migrations (name, checksum)
values ('$local_name', '$local_checksum');
commit;
SQL
    echo "[applied] $local_name"
  done

  echo "[done] Migration check finished."
}

status() {
  ensure_migrations_table

  for file_path in "$MIGRATIONS_DIR"/*.sql; do
    [ -e "$file_path" ] || continue
    assert_no_drift "$file_path"

    name="$(basename "$file_path")"
    if [ -n "$(applied_checksum "$name")" ]; then
      echo "applied $name"
    else
      echo "pending $name"
    fi
  done
}

load_env

case "$COMMAND" in
  bootstrap) bootstrap ;;
  migrate) migrate ;;
  status) status ;;
  *)
    echo "[db_runner_failed] Unknown command: $COMMAND. Use bootstrap, migrate, or status." >&2
    exit 1
    ;;
esac
