-- Public read for published Class Topics (anon + authenticated).
-- Drafts remain staff-only. Run once in Supabase SQL Editor.

-- Topics: anyone can read published; staff still see drafts via role check
drop policy if exists "class_topics_select_approved" on public.class_topics;
drop policy if exists "class_topics_select_published" on public.class_topics;
drop policy if exists "class_topics_select_staff_drafts" on public.class_topics;

create policy "class_topics_select_published"
  on public.class_topics for select to anon, authenticated
  using (is_published = true);

create policy "class_topics_select_staff_drafts"
  on public.class_topics for select to authenticated
  using (public.has_role(array['teacher', 'tech']));

grant select on public.class_topics to anon, authenticated;

-- Meeting links for published topics only (staff see all links)
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
      where t.id = topic_id and t.is_published = true
    )
  );

create policy "class_topic_meetings_select_staff"
  on public.class_topic_meetings for select to authenticated
  using (public.has_role(array['teacher', 'tech']));

grant select on public.class_topic_meetings to anon, authenticated;

-- Meeting dates for topic display (calendar rows are already often public;
-- keep/idempotent public read so guests can resolve starts_at)
drop policy if exists "classes_select_approved" on public.classes;
drop policy if exists "classes_select_public" on public.classes;
create policy "classes_select_public"
  on public.classes for select to anon, authenticated
  using (true);

grant select on public.classes to anon, authenticated;
