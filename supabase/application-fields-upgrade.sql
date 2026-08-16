-- Run once in Supabase SQL Editor on the existing project.
-- Adds optional application fields shown on Approvals.

alter table public.profiles
  add column if not exists heard_from text not null default '';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  req text;
  name text;
  htown text;
  heard text;
begin
  req := coalesce(new.raw_user_meta_data->>'requested_role', 'student');
  if req not in ('student', 'teacher') then
    req := 'student';
  end if;
  name := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1));
  htown := coalesce(nullif(trim(new.raw_user_meta_data->>'hometown'), ''), '');
  heard := coalesce(nullif(trim(new.raw_user_meta_data->>'heard_from'), ''), '');

  insert into public.profiles (
    id, display_name, role, status, requested_role, hometown, heard_from
  )
  values (new.id, name, req, 'pending', req, htown, heard);
  return new;
end;
$$;
