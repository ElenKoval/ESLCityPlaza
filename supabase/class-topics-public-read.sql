-- Public read for published class topics (current + past).
-- Prefer class-topics-status-upgrade.sql on existing DBs.

drop policy if exists "class_topics_select_approved" on public.class_topics;
drop policy if exists "class_topics_select_published" on public.class_topics;
drop policy if exists "class_topics_select_staff_drafts" on public.class_topics;

create policy "class_topics_select_published"
  on public.class_topics for select to anon, authenticated
  using (status in ('current', 'past'));

create policy "class_topics_select_staff_drafts"
  on public.class_topics for select to authenticated
  using (public.has_role(array['teacher', 'tech']));

grant select on public.class_topics to anon, authenticated;

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

grant select on public.class_topic_meetings to anon, authenticated;
