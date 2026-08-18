-- Conversations on the Plaza — mute blocks all Community Chat access (read + write)
-- Prerequisite: supabase/admin-moderation-upgrade.sql (is_not_muted, profiles.muted)
--
-- Run once in Supabase SQL Editor after admin-moderation-upgrade.sql.
-- Does not change suspend behavior or staff moderation delete policies.

-- ---------------------------------------------------------------------------
-- 1. Messages: muted members cannot read or delete in chat
--    (insert already requires is_not_muted(); staff delete policies unchanged)
-- ---------------------------------------------------------------------------
drop policy if exists "messages_select_approved" on public.messages;
create policy "messages_select_approved"
  on public.messages for select to authenticated
  using (
    public.is_approved()
    and public.is_not_muted()
  );

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own"
  on public.messages for delete to authenticated
  using (
    user_id = auth.uid()
    and public.is_approved()
    and public.is_not_muted()
  );

-- ---------------------------------------------------------------------------
-- 2. Storage: muted members cannot read chat attachments
--    (upload already requires is_not_muted(); staff delete policies unchanged)
-- ---------------------------------------------------------------------------
drop policy if exists "chat_images_select_approved" on storage.objects;
create policy "chat_images_select_approved"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-images'
    and public.is_approved()
    and public.is_not_muted()
  );

drop policy if exists "chat_files_select_approved" on storage.objects;
create policy "chat_files_select_approved"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-files'
    and public.is_approved()
    and public.is_not_muted()
  );
