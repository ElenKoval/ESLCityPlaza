-- Optional: let guests read current announcements without logging in.
-- The live site can also load them with the service role key.

drop policy if exists "announcements_select_approved" on public.announcements;
drop policy if exists "announcements_select_public" on public.announcements;
drop policy if exists "announcements_select_staff_all" on public.announcements;

create policy "announcements_select_public"
  on public.announcements for select to anon, authenticated
  using (
    is_active = true
    and (expires_at is null or expires_at > now())
  );

create policy "announcements_select_staff_all"
  on public.announcements for select to authenticated
  using (public.has_role(array['teacher', 'tech']));
