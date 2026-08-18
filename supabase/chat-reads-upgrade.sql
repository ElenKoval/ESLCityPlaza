-- Conversations on the Plaza — Community Chat unread
-- Run once in Supabase SQL Editor.
-- One last-read timestamp per member. Opening Chat clears the header dot.

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
