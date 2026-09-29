-- class_topics: replace is_published with status (draft | current | past)
-- At most one current topic. Meetings stay informational only.

-- 1) Add status
alter table public.class_topics
  add column if not exists status text;

update public.class_topics
set status = 'draft'
where status is null and coalesce(is_published, false) = false;

update public.class_topics
set status = 'past'
where status is null and coalesce(is_published, false) = true;

-- Newest published becomes the single current
with newest as (
  select id
  from public.class_topics
  where status = 'past'
  order by created_at desc
  limit 1
)
update public.class_topics t
set status = 'current'
from newest n
where t.id = n.id;

alter table public.class_topics
  alter column status set default 'draft';

alter table public.class_topics
  alter column status set not null;

alter table public.class_topics
  drop constraint if exists class_topics_status_check;

alter table public.class_topics
  add constraint class_topics_status_check
  check (status in ('draft', 'current', 'past'));

-- 2) Only one current
drop index if exists public.class_topics_one_current_idx;
create unique index class_topics_one_current_idx
  on public.class_topics ((true))
  where status = 'current';

drop index if exists public.class_topics_published_idx;
create index if not exists class_topics_status_idx
  on public.class_topics (status, created_at desc);

-- 3) Drop is_published
alter table public.class_topics
  drop column if exists is_published;

-- 4) RLS: public sees current + past
drop policy if exists "class_topics_select_approved" on public.class_topics;
drop policy if exists "class_topics_select_published" on public.class_topics;
drop policy if exists "class_topics_select_staff_drafts" on public.class_topics;

create policy "class_topics_select_published"
  on public.class_topics for select to anon, authenticated
  using (status in ('current', 'past'));

create policy "class_topics_select_staff_drafts"
  on public.class_topics for select to authenticated
  using (public.has_role(array['teacher', 'tech']));

drop policy if exists "class_topic_meetings_select_approved"
  on public.class_topic_meetings;
drop policy if exists "class_topic_meetings_select_published"
  on public.class_topic_meetings;
drop policy if exists "class_topic_meetings_select_staff"
  on public.class_topic_meetings;

create policy "class_topic_meetings_select_published"
  on public.class_topic_meetings for select to anon, authenticated
  using (
    exists (
      select 1
      from public.class_topics t
      where t.id = topic_id and t.status in ('current', 'past')
    )
  );

create policy "class_topic_meetings_select_staff"
  on public.class_topic_meetings for select to authenticated
  using (public.has_role(array['teacher', 'tech']));
