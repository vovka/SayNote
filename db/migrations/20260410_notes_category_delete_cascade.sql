alter table notes
  drop constraint if exists notes_category_id_fkey;

alter table notes
  add constraint notes_category_id_fkey
  foreign key (category_id)
  references categories(id)
  on delete cascade;
