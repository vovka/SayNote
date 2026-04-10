alter table categories
  add column if not exists is_locked boolean not null default false,
  add column if not exists normalized_name text,
  add column if not exists normalized_path_cache text;

with recursive category_paths as (
  select
    c.id,
    c.parent_id,
    trim(regexp_replace(c.name, '\\s+', ' ', 'g')) as normalized_name,
    trim(regexp_replace(c.name, '\\s+', ' ', 'g')) as display_path,
    lower(trim(regexp_replace(c.name, '\\s+', ' ', 'g'))) as normalized_path
  from categories c
  where c.parent_id is null

  union all

  select
    child.id,
    child.parent_id,
    trim(regexp_replace(child.name, '\\s+', ' ', 'g')) as normalized_name,
    parent.display_path || ' > ' || trim(regexp_replace(child.name, '\\s+', ' ', 'g')) as display_path,
    parent.normalized_path || ' > ' || lower(trim(regexp_replace(child.name, '\\s+', ' ', 'g'))) as normalized_path
  from categories child
  inner join category_paths parent on parent.id = child.parent_id
)
update categories c
set normalized_name = cp.normalized_name,
    path_cache = cp.display_path,
    normalized_path_cache = cp.normalized_path,
    updated_at = now()
from category_paths cp
where c.id = cp.id;

update categories
set normalized_name = lower(trim(regexp_replace(name, '\\s+', ' ', 'g')))
where normalized_name is null;

update categories
set normalized_path_cache = lower(trim(regexp_replace(path_cache, '\\s+', ' ', 'g')))
where normalized_path_cache is null;

alter table categories
  alter column normalized_name set not null,
  alter column normalized_path_cache set not null;

drop index if exists categories_user_parent_name_unique_idx;

create unique index if not exists categories_user_parent_normalized_name_unique_idx
  on categories (user_id, parent_id, normalized_name) nulls not distinct;
