-- Run once in Supabase SQL Editor.
-- Class Topics: one topic can link to many meetings (many-to-many).
-- Preserves existing topic rows and migrates each class_id link.

-- 1) Junction table
create table if not exists public.class_topic_meetings (
  topic_id uuid not null references public.class_topics (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  primary key (topic_id, class_id)
);

create index if not exists class_topic_meetings_class_id_idx
  on public.class_topic_meetings (class_id);

create index if not exists class_topic_meetings_topic_id_idx
  on public.class_topic_meetings (topic_id);

-- 2) Migrate existing one-to-one links (idempotent)
insert into public.class_topic_meetings (topic_id, class_id)
select t.id, t.class_id
from public.class_topics t
where t.class_id is not null
  and not exists (
    select 1
    from public.class_topic_meetings m
    where m.topic_id = t.id and m.class_id = t.class_id
  );

-- 3) Drop old unique index / column on class_topics.class_id
drop index if exists public.class_topics_published_idx;

alter table public.class_topics
  drop constraint if exists class_topics_class_id_key;

alter table public.class_topics
  drop column if exists class_id;

create index if not exists class_topics_published_idx
  on public.class_topics (is_published, created_at desc);

-- 4) RLS for junction (same roles as class_topics)
alter table public.class_topic_meetings enable row level security;

drop policy if exists "class_topic_meetings_select_approved"
  on public.class_topic_meetings;
create policy "class_topic_meetings_select_approved"
  on public.class_topic_meetings for select to authenticated
  using (
    public.has_role(array['teacher', 'tech'])
    or (
      public.is_approved()
      and exists (
        select 1
        from public.class_topics t
        where t.id = topic_id and t.is_published = true
      )
    )
  );

drop policy if exists "class_topic_meetings_insert_staff"
  on public.class_topic_meetings;
create policy "class_topic_meetings_insert_staff"
  on public.class_topic_meetings for insert to authenticated
  with check (public.has_role(array['teacher', 'tech']));

drop policy if exists "class_topic_meetings_update_staff"
  on public.class_topic_meetings;
create policy "class_topic_meetings_update_staff"
  on public.class_topic_meetings for update to authenticated
  using (public.has_role(array['teacher', 'tech']))
  with check (public.has_role(array['teacher', 'tech']));

drop policy if exists "class_topic_meetings_delete_staff"
  on public.class_topic_meetings;
create policy "class_topic_meetings_delete_staff"
  on public.class_topic_meetings for delete to authenticated
  using (public.has_role(array['teacher', 'tech']));
