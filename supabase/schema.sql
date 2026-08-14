-- ESL on Plaza — run this in Supabase SQL Editor once

create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role text not null default 'student'
    check (role in ('student', 'volunteer', 'teacher', 'tech')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_role text
    check (requested_role in ('student', 'volunteer')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  capacity int not null default 15 check (capacity > 0 and capacity <= 15),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.enrollments (
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) > 0 and char_length(body) <= 2000),
  is_announcement boolean not null default false,
  created_at timestamptz not null default now()
);

create index messages_created_at_idx on public.messages (created_at);
create index classes_starts_at_idx on public.classes (starts_at);
create index profiles_status_idx on public.profiles (status);

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

create or replace function public.has_role(roles text[])
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
      and role = any (roles)
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  req text;
  name text;
begin
  req := coalesce(new.raw_user_meta_data->>'requested_role', 'student');
  if req not in ('student', 'volunteer') then
    req := 'student';
  end if;
  name := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1));

  insert into public.profiles (id, display_name, role, status, requested_role)
  values (new.id, name, req, 'pending', req);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.enrollments enable row level security;
alter table public.messages enable row level security;

-- profiles
create policy "profiles_select_own_or_approved"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_approved()
  );

create or replace function public.guard_profile_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow Supabase SQL editor / service role (no JWT)
  if auth.uid() is null then
    return new;
  end if;

  if (old.role is distinct from new.role)
     or (old.status is distinct from new.status)
     or (old.reviewed_at is distinct from new.reviewed_at)
     or (old.reviewed_by is distinct from new.reviewed_by)
  then
    if not public.has_role(array['tech']) then
      raise exception 'Only tech can change role or status';
    end if;
  end if;
  if old.requested_role is distinct from new.requested_role
     and auth.uid() is not null
  then
    raise exception 'requested_role is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_updates on public.profiles;
create trigger profiles_guard_updates
  before update on public.profiles
  for each row execute function public.guard_profile_updates();

create policy "profiles_update_authenticated"
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_role(array['tech']))
  with check (id = auth.uid() or public.has_role(array['tech']));

-- classes: approved members can read; staff can write
drop policy if exists "classes_select_approved" on public.classes;
create policy "classes_select_approved"
  on public.classes for select to authenticated
  using (public.is_approved());

drop policy if exists "classes_write_staff" on public.classes;
create policy "classes_write_staff"
  on public.classes for all to authenticated
  using (public.has_role(array['teacher', 'tech']))
  with check (public.has_role(array['teacher', 'tech']));

-- enrollments
drop policy if exists "enrollments_select_approved" on public.enrollments;
create policy "enrollments_select_approved"
  on public.enrollments for select to authenticated
  using (public.is_approved());

drop policy if exists "enrollments_insert_own" on public.enrollments;
create policy "enrollments_insert_own"
  on public.enrollments for insert to authenticated
  with check (user_id = auth.uid() and public.is_approved());

drop policy if exists "enrollments_delete_own" on public.enrollments;
create policy "enrollments_delete_own"
  on public.enrollments for delete to authenticated
  using (user_id = auth.uid() and public.is_approved());

drop policy if exists "enrollments_delete_staff" on public.enrollments;
create policy "enrollments_delete_staff"
  on public.enrollments for delete to authenticated
  using (public.has_role(array['teacher', 'tech']));

-- messages
drop policy if exists "messages_select_approved" on public.messages;
create policy "messages_select_approved"
  on public.messages for select to authenticated
  using (public.is_approved());

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_approved()
    and (
      is_announcement = false
      or public.has_role(array['volunteer', 'teacher', 'tech'])
    )
  );

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own"
  on public.messages for delete to authenticated
  using (user_id = auth.uid() and public.is_approved());

alter table public.messages
  add column if not exists is_announcement boolean not null default false;

alter table public.messages replica identity full;

-- Realtime (safe if already added)
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

-- Seed upcoming Mon/Fri sessions (1:00–3:00 PM America/Los_Angeles) for ~6 weeks
insert into public.classes (title, description, starts_at, capacity)
select
  case when extract(dow from d) = 1 then 'Monday Session' else 'Friday Session' end,
  '1:00 PM – 3:00 PM practice with the group',
  ((d + time '13:00') at time zone 'America/Los_Angeles'),
  15
from generate_series(
  current_date,
  (current_date + interval '42 days')::date,
  interval '1 day'
) as g(d)
where extract(dow from d) in (1, 5)
  and ((d + time '13:00') at time zone 'America/Los_Angeles') > now()
  and not exists (
    select 1
    from public.classes c
    where c.starts_at = ((d + time '13:00') at time zone 'America/Los_Angeles')
  );

-- After you register once, promote yourself to Tech (replace the email):
-- update public.profiles
-- set role = 'tech', status = 'approved', reviewed_at = now()
-- where id = (
--   select id from auth.users where email = 'you@example.com'
-- );
