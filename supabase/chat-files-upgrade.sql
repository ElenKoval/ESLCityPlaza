-- ESL on the Plaza — private chat text files
-- Run in Supabase SQL Editor after review. Do not apply until confirmed.
-- Prerequisite: supabase/chat-images-upgrade.sql

-- ---------------------------------------------------------------------------
-- 1. Message fields: one optional .txt file per message
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists file_path text,
  add column if not exists file_name text;

alter table public.messages
  drop constraint if exists messages_body_or_image_check;

alter table public.messages
  drop constraint if exists messages_body_or_attachment_check;

alter table public.messages
  add constraint messages_body_or_attachment_check
  check (
    char_length(body) <= 2000
    and (
      char_length(btrim(body)) > 0
      or (image_path is not null and char_length(image_path) > 0)
      or (file_path is not null and char_length(file_path) > 0)
    )
    and not (
      image_path is not null
      and char_length(image_path) > 0
      and file_path is not null
      and char_length(file_path) > 0
    )
  );

alter table public.messages
  drop constraint if exists messages_file_path_check;

alter table public.messages
  add constraint messages_file_path_check
  check (
    file_path is null
    or file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.txt$'
  );

alter table public.messages
  drop constraint if exists messages_file_name_check;

alter table public.messages
  add constraint messages_file_name_check
  check (
    (file_path is null and file_name is null)
    or (
      file_path is not null
      and file_name is not null
      and char_length(file_name) > 0
      and char_length(file_name) <= 80
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Private Storage bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-files',
  'chat-files',
  false,
  262144,
  array['text/plain']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 262144,
  allowed_mime_types = array['text/plain'];

-- ---------------------------------------------------------------------------
-- 3. Storage RLS — same rules as chat photos
-- ---------------------------------------------------------------------------
drop policy if exists "chat_files_select_approved" on storage.objects;
create policy "chat_files_select_approved"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-files'
    and public.is_approved()
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
