-- Run once in Supabase SQL Editor if chat already exists.

alter table public.messages
  add column if not exists is_announcement boolean not null default false;

alter table public.messages replica identity full;

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
