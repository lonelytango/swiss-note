alter table public.notes
  add column if not exists is_code_snippet boolean not null default false;

alter table public.notes
  add column if not exists code_language text not null default '';
