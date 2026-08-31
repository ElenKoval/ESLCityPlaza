-- Find Auth users who have NO row in public.profiles (they won't appear in Manage Members).
-- Run in Supabase SQL Editor.

select
  u.id,
  u.email,
  u.created_at,
  u.email_confirmed_at,
  u.raw_user_meta_data->>'display_name' as display_name
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
order by u.created_at desc;

-- Backfill missing profiles (safe to re-run: skips existing ids).
insert into public.profiles (
  id,
  display_name,
  role,
  status,
  requested_role,
  hometown,
  heard_from,
  muted
)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
    split_part(u.email, '@', 1)
  ),
  'student',
  'pending',
  case
    when coalesce(u.raw_user_meta_data->>'requested_role', 'student') in ('student', 'teacher')
      then coalesce(u.raw_user_meta_data->>'requested_role', 'student')
    else 'student'
  end,
  coalesce(nullif(trim(u.raw_user_meta_data->>'hometown'), ''), ''),
  coalesce(nullif(trim(u.raw_user_meta_data->>'heard_from'), ''), ''),
  false
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- Pending profiles whose email is NOT confirmed yet (often hidden from Manage Members UI).
select
  p.id,
  p.display_name,
  p.status,
  p.created_at,
  u.email,
  u.email_confirmed_at
from public.profiles p
join auth.users u on u.id = p.id
where p.status = 'pending'
  and u.email_confirmed_at is null
order by p.created_at desc;
