-- Run once in Supabase SQL Editor on the existing project.

-- 1) Drop old checks first, then fold volunteer into teacher.
--    (The old requested_role check only allowed student/volunteer, so it
--    cannot be updated to teacher until the constraint is gone.)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop constraint if exists profiles_requested_role_check;

update public.profiles
set role = 'teacher'
where role = 'volunteer';

update public.profiles
set requested_role = 'teacher'
where requested_role = 'volunteer';

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'teacher', 'tech'));

alter table public.profiles
  add constraint profiles_requested_role_check
  check (requested_role is null or requested_role in ('student', 'teacher'));

-- 2) Signup trigger: Student or Teacher only. Never tech.
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

-- 3) Guard: students cannot change role/status; teachers can review
--    students/pending; nobody with a JWT can create or alter TECH.
create or replace function public.guard_profile_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.role = 'tech' and old.role is distinct from 'tech' then
    raise exception 'Tech role cannot be assigned this way';
  end if;

  if old.role = 'tech' and (
    old.role is distinct from new.role
    or old.status is distinct from new.status
    or old.reviewed_at is distinct from new.reviewed_at
    or old.reviewed_by is distinct from new.reviewed_by
  ) then
    raise exception 'Cannot change a tech account';
  end if;

  if (old.role is distinct from new.role)
     or (old.status is distinct from new.status)
     or (old.reviewed_at is distinct from new.reviewed_at)
     or (old.reviewed_by is distinct from new.reviewed_by)
  then
    if not public.has_role(array['teacher', 'tech']) then
      raise exception 'Only teacher or tech can change role or status';
    end if;

    if new.role not in ('student', 'teacher', 'tech') then
      raise exception 'Invalid role';
    end if;

    if public.has_role(array['teacher']) and not public.has_role(array['tech']) then
      if old.role = 'teacher' and old.status = 'approved' then
        raise exception 'Teachers cannot change other teachers';
      end if;
      if new.role not in ('student', 'teacher') then
        raise exception 'Invalid role';
      end if;
    end if;
  end if;

  if old.requested_role is distinct from new.requested_role then
    raise exception 'requested_role is immutable';
  end if;

  return new;
end;
$$;

drop policy if exists "profiles_update_authenticated" on public.profiles;
create policy "profiles_update_authenticated"
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_role(array['teacher', 'tech']))
  with check (id = auth.uid() or public.has_role(array['teacher', 'tech']));

-- Chat pin announcements: teacher/tech only (no volunteer)
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_approved()
    and (
      is_announcement = false
      or public.has_role(array['teacher', 'tech'])
    )
  );

-- 4) Homepage announcements
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) > 0 and char_length(title) <= 120),
  body text not null check (char_length(body) > 0 and char_length(body) <= 2000),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  expires_at timestamptz,
  is_important boolean not null default false,
  is_active boolean not null default true
);

create index if not exists announcements_created_at_idx
  on public.announcements (created_at desc);

alter table public.announcements enable row level security;

drop policy if exists "announcements_select_approved" on public.announcements;
create policy "announcements_select_approved"
  on public.announcements for select to authenticated
  using (
    public.is_approved()
    and (
      public.has_role(array['teacher', 'tech'])
      or (
        is_active = true
        and (expires_at is null or expires_at > now())
      )
    )
  );

drop policy if exists "announcements_insert_staff" on public.announcements;
create policy "announcements_insert_staff"
  on public.announcements for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.has_role(array['teacher', 'tech'])
  );

drop policy if exists "announcements_update_staff" on public.announcements;
create policy "announcements_update_staff"
  on public.announcements for update to authenticated
  using (public.has_role(array['teacher', 'tech']))
  with check (public.has_role(array['teacher', 'tech']));

drop policy if exists "announcements_delete_staff" on public.announcements;
create policy "announcements_delete_staff"
  on public.announcements for delete to authenticated
  using (public.has_role(array['teacher', 'tech']));
