-- Keeps updated_at accurate on row updates (optional if client already sends updated_at)

create or replace function public.set_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;

create trigger notes_set_updated_at
  before update on public.notes
  for each row
  execute procedure public.set_notes_updated_at();
