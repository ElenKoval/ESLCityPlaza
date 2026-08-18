-- Conversations on the Plaza — Direct Messages
-- Run once in Supabase SQL Editor.
-- Private 1:1 messages. Roles do not grant access to others' conversations.
-- Community Chat mute does not apply here.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references public.profiles (id) on delete cascade,
  user_high uuid not null references public.profiles (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_sender_id uuid references public.profiles (id) on delete set null,
  last_preview text not null default '',
  check (user_low < user_high),
  check (char_length(last_preview) <= 80),
  unique (user_low, user_high)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  image_path text
    check (
      image_path is null
      or image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
    ),
  image_width integer,
  image_height integer,
  created_at timestamptz not null default now(),
  check (
    char_length(btrim(body)) > 0
    or (image_path is not null and char_length(image_path) > 0)
  )
);

create table if not exists public.direct_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (blocker_id <> blocked_id),
  primary key (blocker_id, blocked_id)
);

create table if not exists public.direct_reads (
  conversation_id uuid not null references public.direct_conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists direct_conversations_last_message_idx
  on public.direct_conversations (last_message_at desc nulls last);

create index if not exists direct_messages_conversation_idx
  on public.direct_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.dm_is_participant(conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.direct_conversations c
    where c.id = conv_id
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  );
$$;

-- True if a block exists in EITHER direction between the two people.
-- Only callable for a pair that includes the current user (no probing others).
create or replace function public.dm_pair_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (auth.uid() = a or auth.uid() = b)
    and exists (
      select 1 from public.direct_blocks
      where (blocker_id = a and blocked_id = b)
         or (blocker_id = b and blocked_id = a)
    );
$$;

create or replace function public.dm_conversation_blocked(conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.dm_pair_blocked(c.user_low, c.user_high)
    from public.direct_conversations c
    where c.id = conv_id
  ), false);
$$;

create or replace function public.dm_blocked_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.direct_conversations c
  where (c.user_low = auth.uid() or c.user_high = auth.uid())
    and public.dm_pair_blocked(c.user_low, c.user_high);
$$;

create or replace function public.dm_preview_text(body text, image_path text)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(coalesce(body, '')), '') is not null
      then left(btrim(body), 80)
    when image_path is not null and char_length(image_path) > 0 then 'Photo'
    else ''
  end;
$$;

create or replace function public.dm_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  latest public.direct_messages%rowtype;
begin
  if tg_op = 'INSERT' then
    update public.direct_conversations
    set
      last_message_at = new.created_at,
      last_sender_id = new.sender_id,
      last_preview = public.dm_preview_text(new.body, new.image_path)
    where id = new.conversation_id;
    return new;
  end if;

  select * into latest
  from public.direct_messages
  where conversation_id = old.conversation_id
  order by created_at desc
  limit 1;

  if latest.id is null then
    update public.direct_conversations
    set last_message_at = null, last_sender_id = null, last_preview = ''
    where id = old.conversation_id;
  else
    update public.direct_conversations
    set
      last_message_at = latest.created_at,
      last_sender_id = latest.sender_id,
      last_preview = public.dm_preview_text(latest.body, latest.image_path)
    where id = old.conversation_id;
  end if;
  return old;
end;
$$;

drop trigger if exists direct_messages_touch on public.direct_messages;
create trigger direct_messages_touch
  after insert or delete on public.direct_messages
  for each row execute function public.dm_touch_conversation();

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;
alter table public.direct_blocks enable row level security;
alter table public.direct_reads enable row level security;

drop policy if exists "dm_conversations_select_participant" on public.direct_conversations;
create policy "dm_conversations_select_participant"
  on public.direct_conversations for select to authenticated
  using (
    public.is_approved()
    and (user_low = auth.uid() or user_high = auth.uid())
  );

drop policy if exists "dm_conversations_insert_own_pair" on public.direct_conversations;
create policy "dm_conversations_insert_own_pair"
  on public.direct_conversations for insert to authenticated
  with check (
    public.is_approved()
    and created_by = auth.uid()
    and (user_low = auth.uid() or user_high = auth.uid())
    and user_low < user_high
    and exists (
      select 1 from public.profiles p
      where p.id = case
        when user_low = auth.uid() then user_high
        else user_low
      end
        and p.status = 'approved'
    )
  );

-- Conversation last_preview / last_message_at are updated only by the
-- security-definer trigger. Clients cannot change pair membership.
drop policy if exists "dm_conversations_update_participant" on public.direct_conversations;

drop policy if exists "dm_messages_select_participant" on public.direct_messages;
create policy "dm_messages_select_participant"
  on public.direct_messages for select to authenticated
  using (
    public.is_approved()
    and public.dm_is_participant(conversation_id)
  );

drop policy if exists "dm_messages_insert_own" on public.direct_messages;
create policy "dm_messages_insert_own"
  on public.direct_messages for insert to authenticated
  with check (
    public.is_approved()
    and sender_id = auth.uid()
    and public.dm_is_participant(conversation_id)
    and not public.dm_conversation_blocked(conversation_id)
  );

drop policy if exists "dm_messages_delete_own" on public.direct_messages;
create policy "dm_messages_delete_own"
  on public.direct_messages for delete to authenticated
  using (
    public.is_approved()
    and sender_id = auth.uid()
    and public.dm_is_participant(conversation_id)
  );

-- Blocked users must not be able to read who blocked them.
-- Send-blocking is enforced by dm_conversation_blocked / dm_pair_blocked.
drop policy if exists "dm_blocks_select_own" on public.direct_blocks;
create policy "dm_blocks_select_own"
  on public.direct_blocks for select to authenticated
  using (
    public.is_approved()
    and blocker_id = auth.uid()
  );

drop policy if exists "dm_blocks_insert_own" on public.direct_blocks;
create policy "dm_blocks_insert_own"
  on public.direct_blocks for insert to authenticated
  with check (
    public.is_approved()
    and blocker_id = auth.uid()
    and blocker_id <> blocked_id
  );

drop policy if exists "dm_blocks_delete_own" on public.direct_blocks;
create policy "dm_blocks_delete_own"
  on public.direct_blocks for delete to authenticated
  using (
    public.is_approved()
    and blocker_id = auth.uid()
  );

drop policy if exists "dm_reads_select_own" on public.direct_reads;
create policy "dm_reads_select_own"
  on public.direct_reads for select to authenticated
  using (
    public.is_approved()
    and user_id = auth.uid()
    and public.dm_is_participant(conversation_id)
  );

drop policy if exists "dm_reads_upsert_own" on public.direct_reads;
create policy "dm_reads_upsert_own"
  on public.direct_reads for insert to authenticated
  with check (
    public.is_approved()
    and user_id = auth.uid()
    and public.dm_is_participant(conversation_id)
  );

drop policy if exists "dm_reads_update_own" on public.direct_reads;
create policy "dm_reads_update_own"
  on public.direct_reads for update to authenticated
  using (
    public.is_approved()
    and user_id = auth.uid()
  )
  with check (
    public.is_approved()
    and user_id = auth.uid()
    and public.dm_is_participant(conversation_id)
  );

-- ---------------------------------------------------------------------------
-- 4. Private photos — only the two participants
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'direct-message-images',
  'direct-message-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "dm_images_select_participants" on storage.objects;
create policy "dm_images_select_participants"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'direct-message-images'
    and public.is_approved()
    and public.dm_is_participant(split_part(name, '/', 1)::uuid)
  );

drop policy if exists "dm_images_insert_participants" on storage.objects;
create policy "dm_images_insert_participants"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'direct-message-images'
    and public.is_approved()
    and public.dm_is_participant(split_part(name, '/', 1)::uuid)
    and not public.dm_conversation_blocked(split_part(name, '/', 1)::uuid)
  );

drop policy if exists "dm_images_delete_participants" on storage.objects;
drop policy if exists "dm_images_delete_own" on storage.objects;
create policy "dm_images_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'direct-message-images'
    and public.is_approved()
    and public.dm_is_participant(split_part(name, '/', 1)::uuid)
    and exists (
      select 1 from public.direct_messages m
      where m.image_path = name
        and m.sender_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Realtime — RLS still filters which rows a client can receive
-- ---------------------------------------------------------------------------
alter table public.direct_conversations replica identity full;
alter table public.direct_messages replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.direct_conversations;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.direct_messages;
  exception
    when duplicate_object then null;
  end;
end $$;

alter table public.site_activity drop constraint if exists site_activity_last_section_check;
alter table public.site_activity
  add constraint site_activity_last_section_check
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
  );

grant select, insert on public.direct_conversations to authenticated;
grant select, insert, delete on public.direct_messages to authenticated;
grant select, insert, delete on public.direct_blocks to authenticated;
grant select, insert, update on public.direct_reads to authenticated;
grant all on public.direct_conversations, public.direct_messages, public.direct_blocks, public.direct_reads to service_role;

revoke all on function public.dm_is_participant(uuid) from public;
revoke all on function public.dm_pair_blocked(uuid, uuid) from public;
revoke all on function public.dm_conversation_blocked(uuid) from public;
revoke all on function public.dm_blocked_conversation_ids() from public;
grant execute on function public.dm_is_participant(uuid) to authenticated;
grant execute on function public.dm_pair_blocked(uuid, uuid) to authenticated;
grant execute on function public.dm_conversation_blocked(uuid) to authenticated;
grant execute on function public.dm_blocked_conversation_ids() to authenticated;
