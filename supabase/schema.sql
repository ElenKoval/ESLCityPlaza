-- ESL on the Plaza — run this in Supabase SQL Editor once

create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role text not null default 'student'
    check (role in ('student', 'teacher', 'admin', 'tech')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended')),
  requested_role text
    check (requested_role in ('student', 'teacher')),
  hometown text not null default '',
  heard_from text not null default '',
  languages text[] not null default '{}',
  interests text[] not null default '{}',
  bio text not null default '',
  muted boolean not null default false,
  avatar_color text not null default '#c4510c'
    check (
      avatar_color in (
        '#c4510c',
        '#2f6f4e',
        '#3d5a80',
        '#9a3412',
        '#6b3fa0',
        '#0f766e'
      )
    ),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  location text not null default 'on the Plaza',
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
  body text not null default '' check (char_length(body) <= 2000),
  is_announcement boolean not null default false,
  image_path text
    check (
      image_path is null
      or image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
    ),
  image_width integer,
  image_height integer,
  file_path text
    check (
      file_path is null
      or file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.txt$'
    ),
  file_name text,
  created_at timestamptz not null default now(),
  check (
    char_length(btrim(body)) > 0
    or (image_path is not null and char_length(image_path) > 0)
    or (file_path is not null and char_length(file_path) > 0)
  ),
  check (
    not (
      image_path is not null
      and char_length(image_path) > 0
      and file_path is not null
      and char_length(file_path) > 0
    )
  ),
  check (
    (file_path is null and file_name is null)
    or (
      file_path is not null
      and file_name is not null
      and char_length(file_name) > 0
      and char_length(file_name) <= 80
    )
  ),
  check (
    (image_width is null and image_height is null)
    or (
      image_width is not null
      and image_height is not null
      and image_width > 0
      and image_height > 0
      and image_width <= 4000
      and image_height <= 4000
    )
  )
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
  using (public.has_role(array['teacher', 'admin', 'tech']));

-- messages
drop policy if exists "messages_select_approved" on public.messages;
create policy "messages_select_approved"
  on public.messages for select to authenticated
  using (
    public.is_approved()
    and public.is_not_muted()
  );

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

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own"
  on public.messages for delete to authenticated
  using (
    user_id = auth.uid()
    and public.is_approved()
    and public.is_not_muted()
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

-- announcements (homepage)
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

-- class topics (one optional discussion topic per class)
create table if not exists public.class_topics (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null unique references public.classes (id) on delete cascade,
  title text not null check (char_length(title) > 0 and char_length(title) <= 80),
  content text not null check (char_length(content) > 0 and char_length(content) <= 8000),
  created_by uuid not null references public.profiles (id) on delete cascade,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_topics_published_idx
  on public.class_topics (is_published, class_id);

alter table public.class_topics enable row level security;

drop policy if exists "class_topics_select_approved" on public.class_topics;
create policy "class_topics_select_approved"
  on public.class_topics for select to authenticated
  using (
    public.has_role(array['teacher', 'tech'])
    or (public.is_approved() and is_published = true)
  );

drop policy if exists "class_topics_insert_staff" on public.class_topics;
create policy "class_topics_insert_staff"
  on public.class_topics for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.has_role(array['teacher', 'tech'])
  );

drop policy if exists "class_topics_update_staff" on public.class_topics;
create policy "class_topics_update_staff"
  on public.class_topics for update to authenticated
  using (public.has_role(array['teacher', 'tech']))
  with check (public.has_role(array['teacher', 'tech']));

drop policy if exists "class_topics_delete_staff" on public.class_topics;
create policy "class_topics_delete_staff"
  on public.class_topics for delete to authenticated
  using (public.has_role(array['teacher', 'tech']));

-- moderation audit log (writes only via trigger; TECH can select)
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

-- Private chat photos (approved members only; muted cannot upload)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "chat_images_select_approved" on storage.objects;
create policy "chat_images_select_approved"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-images'
    and public.is_approved()
    and public.is_not_muted()
  );

drop policy if exists "chat_images_insert_own" on storage.objects;
create policy "chat_images_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and public.is_approved()
    and public.is_not_muted()
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "chat_images_delete_own" on storage.objects;
create policy "chat_images_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-images'
    and public.is_approved()
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "chat_images_delete_staff" on storage.objects;
create policy "chat_images_delete_staff"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-images'
    and public.has_role(array['teacher', 'tech'])
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-files',
  'chat-files',
  false,
  262144,
  array['text/plain']
)
on conflict (id) do nothing;

drop policy if exists "chat_files_select_approved" on storage.objects;
create policy "chat_files_select_approved"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-files'
    and public.is_approved()
    and public.is_not_muted()
  );

drop policy if exists "chat_files_insert_own" on storage.objects;
create policy "chat_files_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-files'
    and public.is_approved()
    and public.is_not_muted()
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "chat_files_delete_own" on storage.objects;
create policy "chat_files_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-files'
    and public.is_approved()
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "chat_files_delete_staff" on storage.objects;
create policy "chat_files_delete_staff"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-files'
    and public.has_role(array['teacher', 'tech'])
  );

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

-- site activity (current section only; TECH can read everyone)
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

-- Direct Messages (1:1, private). Apply supabase/direct-messages-upgrade.sql
-- for tables, RLS, the private photo bucket, and Realtime publication.

-- Community Chat unread. Apply supabase/chat-reads-upgrade.sql on existing DBs.
create table if not exists public.chat_reads (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now()
);

alter table public.chat_reads enable row level security;

drop policy if exists "chat_reads_select_own" on public.chat_reads;
create policy "chat_reads_select_own"
  on public.chat_reads for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "chat_reads_insert_own" on public.chat_reads;
create policy "chat_reads_insert_own"
  on public.chat_reads for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_approved()
  );

drop policy if exists "chat_reads_update_own" on public.chat_reads;
create policy "chat_reads_update_own"
  on public.chat_reads for update to authenticated
  using (
    user_id = auth.uid()
    and public.is_approved()
  )
  with check (
    user_id = auth.uid()
    and public.is_approved()
  );

grant select, insert, update on public.chat_reads to authenticated;
grant all on public.chat_reads to service_role;
