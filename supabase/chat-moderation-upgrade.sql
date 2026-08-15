-- Run once in Supabase SQL Editor (existing project).
-- Lets Teacher and Tech delete any chat message.

drop policy if exists "messages_delete_staff" on public.messages;
create policy "messages_delete_staff"
  on public.messages for delete to authenticated
  using (public.is_approved() and public.has_role(array['teacher', 'tech']));
