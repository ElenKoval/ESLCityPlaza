-- ESL on the Plaza — ADMIN role + mute/suspend moderation
-- Run in Supabase SQL Editor after review. Do not apply until confirmed.

-- ---------------------------------------------------------------------------
-- 1. Role / status checks (text + CHECK, not PostgreSQL enums)
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'teacher', 'admin', 'tech'));

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check
  check (status in ('pending', 'approved', 'rejected', 'suspended'));

alter table public.profiles
  add column if not exists muted boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Public signup is always STUDENT (requested_role column is kept)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  name text;
  htown text;
  heard text;
begin
  name := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1));
  htown := coalesce(nullif(trim(new.raw_user_meta_data->>'hometown'), ''), '');
  heard := coalesce(nullif(trim(new.raw_user_meta_data->>'heard_from'), ''), '');

  insert into public.profiles (
    id, display_name, role, status, requested_role, hometown, heard_from, muted
  )
  values (new.id, name, 'student', 'pending', 'student', htown, heard, false);
  return new;
end;
$$;

-- is_approved() stays status = 'approved' only (no suspended).
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  );
$$;

create or replace function public.is_not_muted()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'approved'
      and muted = false
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Self-update + staff permission guard
-- ---------------------------------------------------------------------------
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
    or old.muted is distinct from new.muted
  ) then
    raise exception 'Cannot change a tech account';
  end if;

  -- Own account: never change privileged / moderation fields
  if auth.uid() = old.id then
    if old.role is distinct from new.role
       or old.status is distinct from new.status
       or old.requested_role is distinct from new.requested_role
       or old.muted is distinct from new.muted
       or old.reviewed_at is distinct from new.reviewed_at
       or old.reviewed_by is distinct from new.reviewed_by
    then
      raise exception 'Cannot change role, status, or moderation fields on your own account';
    end if;
    return new;
  end if;

  if old.requested_role is distinct from new.requested_role then
    raise exception 'requested_role is immutable';
  end if;

  if old.muted is distinct from new.muted then
    if not public.has_role(array['admin', 'tech']) then
      raise exception 'Only admin or tech can change mute';
    end if;
    if public.has_role(array['admin']) and not public.has_role(array['tech']) then
      if old.role <> 'student' then
        raise exception 'Admin can only mute students';
      end if;
    end if;
  end if;

  if (old.role is distinct from new.role)
     or (old.status is distinct from new.status)
     or (old.reviewed_at is distinct from new.reviewed_at)
     or (old.reviewed_by is distinct from new.reviewed_by)
  then
    if not public.has_role(array['teacher', 'admin', 'tech']) then
      raise exception 'Not allowed to change role or status';
    end if;

    if new.role not in ('student', 'teacher', 'admin', 'tech') then
      raise exception 'Invalid role';
    end if;

    if new.status not in ('pending', 'approved', 'rejected', 'suspended') then
      raise exception 'Invalid status';
    end if;

    -- Role changes: TECH only, except forcing student on a pending approval
    if old.role is distinct from new.role then
      if old.status = 'pending'
         and new.status = 'approved'
         and new.role = 'student'
         and public.has_role(array['teacher', 'admin', 'tech']) then
        null;
      elsif not public.has_role(array['tech']) then
        raise exception 'Only tech can change roles';
      elsif new.role = 'tech' then
        raise exception 'Tech role cannot be assigned this way';
      end if;
    end if;

    -- Teacher: pending applications only; approve always as student
    if public.has_role(array['teacher'])
       and not public.has_role(array['admin'])
       and not public.has_role(array['tech']) then
      if old.status <> 'pending' then
        raise exception 'Teachers can only review pending applications';
      end if;
      if new.status not in ('approved', 'rejected') then
        raise exception 'Invalid review decision';
      end if;
      if new.status = 'approved' and new.role is distinct from 'student' then
        raise exception 'Approval always creates a student';
      end if;
    end if;

    -- Admin: review pending, or suspend/restore students. No role assignment.
    if public.has_role(array['admin']) and not public.has_role(array['tech']) then
      if old.status = 'pending' then
        if new.status not in ('approved', 'rejected') then
          raise exception 'Invalid review decision';
        end if;
        if new.status = 'approved' and new.role is distinct from 'student' then
          raise exception 'Approval always creates a student';
        end if;
      elsif old.status = 'approved' and new.status = 'suspended' then
        if old.role <> 'student' then
          raise exception 'Admin can only suspend students';
        end if;
      elsif old.status = 'suspended' and new.status = 'approved' then
        if old.role <> 'student' then
          raise exception 'Admin can only restore students';
        end if;
      elsif old.status is not distinct from new.status then
        null;
      else
        raise exception 'Admin cannot make this status change';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_updates on public.profiles;
create trigger profiles_guard_updates
  before update on public.profiles
  for each row execute function public.guard_profile_updates();

drop policy if exists "profiles_update_authenticated" on public.profiles;
create policy "profiles_update_authenticated"
  on public.profiles for update to authenticated
  using (
    id = auth.uid()
    or public.has_role(array['teacher', 'admin', 'tech'])
  )
  with check (
    id = auth.uid()
    or public.has_role(array['teacher', 'admin', 'tech'])
  );

-- ---------------------------------------------------------------------------
-- 4. Chat insert: approved and not muted
-- ---------------------------------------------------------------------------
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_approved()
    and public.is_not_muted()
    and (
      is_announcement = false
      or public.has_role(array['teacher', 'admin', 'tech'])
    )
  );

drop policy if exists "messages_delete_staff" on public.messages;
create policy "messages_delete_staff"
  on public.messages for delete to authenticated
  using (public.is_approved() and public.has_role(array['teacher', 'tech']));

drop policy if exists "messages_delete_admin_student" on public.messages;
create policy "messages_delete_admin_student"
  on public.messages for delete to authenticated
  using (
    public.is_approved()
    and public.has_role(array['admin'])
    and exists (
      select 1 from public.profiles p
      where p.id = messages.user_id
        and p.role = 'student'
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Announcements write: teacher, admin, tech
-- ---------------------------------------------------------------------------
drop policy if exists "announcements_select_staff_all" on public.announcements;
create policy "announcements_select_staff_all"
  on public.announcements for select to authenticated
  using (public.has_role(array['teacher', 'admin', 'tech']));

drop policy if exists "announcements_insert_staff" on public.announcements;
create policy "announcements_insert_staff"
  on public.announcements for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.has_role(array['teacher', 'admin', 'tech'])
  );

drop policy if exists "announcements_update_staff" on public.announcements;
create policy "announcements_update_staff"
  on public.announcements for update to authenticated
  using (public.has_role(array['teacher', 'admin', 'tech']))
  with check (public.has_role(array['teacher', 'admin', 'tech']));

drop policy if exists "announcements_delete_staff" on public.announcements;
create policy "announcements_delete_staff"
  on public.announcements for delete to authenticated
  using (public.has_role(array['teacher', 'admin', 'tech']));

-- ---------------------------------------------------------------------------
-- 6. Enrollments: admin can remove others (roster)
--    classes write and class_topics write stay teacher/tech only
-- ---------------------------------------------------------------------------
drop policy if exists "enrollments_delete_staff" on public.enrollments;
create policy "enrollments_delete_staff"
  on public.enrollments for delete to authenticated
  using (public.has_role(array['teacher', 'admin', 'tech']));

-- ---------------------------------------------------------------------------
-- 7. Moderation audit log
-- ---------------------------------------------------------------------------
create table if not exists public.moderation_log (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('mute', 'unmute', 'suspend', 'unsuspend')),
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  performed_by uuid references public.profiles (id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists moderation_log_created_at_idx
  on public.moderation_log (created_at desc);

alter table public.moderation_log enable row level security;

drop policy if exists "moderation_log_select_tech" on public.moderation_log;
create policy "moderation_log_select_tech"
  on public.moderation_log for select to authenticated
  using (public.has_role(array['tech']));

-- No client insert/update/delete. Writes only from this trigger.
create or replace function public.log_moderation_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.muted is distinct from new.muted then
    insert into public.moderation_log (action, target_user_id, performed_by)
    values (
      case when new.muted then 'mute' else 'unmute' end,
      new.id,
      auth.uid()
    );
  end if;

  if old.status is distinct from new.status then
    if old.status = 'approved' and new.status = 'suspended' then
      insert into public.moderation_log (action, target_user_id, performed_by)
      values ('suspend', new.id, auth.uid());
    elsif old.status = 'suspended' and new.status = 'approved' then
      insert into public.moderation_log (action, target_user_id, performed_by)
      values ('unsuspend', new.id, auth.uid());
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_moderation_log on public.profiles;
create trigger profiles_moderation_log
  after update on public.profiles
  for each row execute function public.log_moderation_changes();
