-- Allow Schedule staff to enroll another approved member into a class.
-- Run once in Supabase SQL Editor.

drop policy if exists "enrollments_insert_staff" on public.enrollments;
create policy "enrollments_insert_staff"
  on public.enrollments for insert to authenticated
  with check (public.has_role(array['teacher', 'admin', 'tech']));
