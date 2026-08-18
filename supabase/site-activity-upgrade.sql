-- Conversations on the Plaza — TECH Site Activity
-- Run once in Supabase SQL Editor.
-- One current-state row per member. Not a browsing history log.

create table if not exists public.site_activity (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  last_section text not null
    check (
      last_section in (
        'Home',
        'Chat',
        'Topics',
        'Manage Members',
        'Schedule',
        'Profile',
        'Announcements',
        'Activity',
        'Direct Messages'
      )
    )
);

create index if not exists site_activity_last_seen_idx
  on public.site_activity (last_seen_at desc);

alter table public.site_activity enable row level security;

drop policy if exists "site_activity_select_own_or_tech" on public.site_activity;
create policy "site_activity_select_own_or_tech"
  on public.site_activity for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(array['tech'])
  );

drop policy if exists "site_activity_insert_own" on public.site_activity;
create policy "site_activity_insert_own"
  on public.site_activity for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_approved()
  );

drop policy if exists "site_activity_update_own" on public.site_activity;
create policy "site_activity_update_own"
  on public.site_activity for update to authenticated
  using (
    user_id = auth.uid()
    and public.is_approved()
  )
  with check (
    user_id = auth.uid()
    and public.is_approved()
  );

grant select, insert, update on public.site_activity to authenticated;
grant all on public.site_activity to service_role;
