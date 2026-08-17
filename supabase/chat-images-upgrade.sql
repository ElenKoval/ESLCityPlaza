-- ESL on the Plaza — private chat photos
-- Run in Supabase SQL Editor after review. Do not apply until confirmed.
-- Prerequisite: supabase/admin-moderation-upgrade.sql (is_not_muted, mute/suspend).
-- This script also recreates is_not_muted() so Storage policies stay consistent.

-- ---------------------------------------------------------------------------
-- 1. Message fields: one optional photo per message
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists image_path text,
  add column if not exists image_width integer,
  add column if not exists image_height integer;

alter table public.messages
  drop constraint if exists messages_body_check;

alter table public.messages
  alter column body set default '';

alter table public.messages
  drop constraint if exists messages_body_or_image_check;

alter table public.messages
  add constraint messages_body_or_image_check
  check (
    char_length(body) <= 2000
    and (
      char_length(btrim(body)) > 0
      or (
        image_path is not null
        and char_length(image_path) > 0
      )
    )
  );

alter table public.messages
  drop constraint if exists messages_image_path_check;

alter table public.messages
  add constraint messages_image_path_check
  check (
    image_path is null
    or image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
  );

alter table public.messages
  drop constraint if exists messages_image_size_check;

alter table public.messages
  add constraint messages_image_size_check
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
  );

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
-- 2. Private Storage bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- ---------------------------------------------------------------------------
-- 3. Storage RLS
--    Approved members can read.
--    Upload only own folder, approved and not muted.
--    No overwrite policy (no UPDATE).
--    Owner can delete own object; Teacher/Tech can delete any chat image.
--    Admin deletes student photos through the Server Action (service role)
--    after the same message-delete permission check.
-- ---------------------------------------------------------------------------
drop policy if exists "chat_images_select_approved" on storage.objects;
create policy "chat_images_select_approved"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-images'
    and public.is_approved()
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
