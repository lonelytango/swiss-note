-- Categories (per user), tags (label + color), note ↔ tag junction, optional category on note.

create table if not exists public.note_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists note_categories_user_id_name_idx
  on public.note_categories (user_id, name);

alter table public.note_categories enable row level security;

create policy "Users manage own categories"
  on public.note_categories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  color text not null default '#737373',
  created_at timestamptz not null default now(),
  unique (user_id, label)
);

create index if not exists tags_user_id_label_idx
  on public.tags (user_id, label);

alter table public.tags enable row level security;

create policy "Users manage own tags"
  on public.tags for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.notes
  add column if not exists category_id uuid references public.note_categories (id) on delete set null;

create index if not exists notes_category_id_idx
  on public.notes (category_id);

create table if not exists public.note_tags (
  note_id uuid not null references public.notes (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (note_id, tag_id)
);

create index if not exists note_tags_tag_id_idx
  on public.note_tags (tag_id);

alter table public.note_tags enable row level security;

create policy "Users manage note_tags for own notes"
  on public.note_tags for all
  using (
    exists (
      select 1 from public.notes n
      where n.id = note_tags.note_id and n.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.notes n
      where n.id = note_tags.note_id and n.user_id = auth.uid()
    )
    and exists (
      select 1 from public.tags t
      where t.id = note_tags.tag_id and t.user_id = auth.uid()
    )
  );
