-- Run once in Supabase SQL Editor on the existing project.
-- Class Topics: one optional discussion topic per class.

create table if not exists public.class_topics (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null unique references public.classes (id) on delete cascade,
  title text not null check (char_length(title) > 0 and char_length(title) <= 80),
  content text not null check (char_length(content) > 0 and char_length(content) <= 8000),
  created_by uuid not null references public.profiles (id) on delete cascade,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_topics_published_idx
  on public.class_topics (is_published, class_id);

alter table public.class_topics enable row level security;

drop policy if exists "class_topics_select_approved" on public.class_topics;
create policy "class_topics_select_approved"
  on public.class_topics for select to authenticated
  using (
    public.has_role(array['teacher', 'tech'])
    or (public.is_approved() and is_published = true)
  );

drop policy if exists "class_topics_insert_staff" on public.class_topics;
create policy "class_topics_insert_staff"
  on public.class_topics for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.has_role(array['teacher', 'tech'])
  );

drop policy if exists "class_topics_update_staff" on public.class_topics;
create policy "class_topics_update_staff"
  on public.class_topics for update to authenticated
  using (public.has_role(array['teacher', 'tech']))
  with check (public.has_role(array['teacher', 'tech']));

drop policy if exists "class_topics_delete_staff" on public.class_topics;
create policy "class_topics_delete_staff"
  on public.class_topics for delete to authenticated
  using (public.has_role(array['teacher', 'tech']));
