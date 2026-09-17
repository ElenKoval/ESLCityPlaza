-- Class waitlist: up to 6 people per class, FIFO promote when a seat opens.
-- Run once in Supabase SQL Editor.

create table if not exists public.class_waitlist (
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

create index if not exists class_waitlist_class_created_idx
  on public.class_waitlist (class_id, created_at);

alter table public.class_waitlist enable row level security;

drop policy if exists "class_waitlist_select_approved" on public.class_waitlist;
create policy "class_waitlist_select_approved"
  on public.class_waitlist for select to authenticated
  using (public.is_approved());

drop policy if exists "class_waitlist_insert_own" on public.class_waitlist;
create policy "class_waitlist_insert_own"
  on public.class_waitlist for insert to authenticated
  with check (user_id = auth.uid() and public.is_approved());

drop policy if exists "class_waitlist_delete_own" on public.class_waitlist;
create policy "class_waitlist_delete_own"
  on public.class_waitlist for delete to authenticated
  using (user_id = auth.uid() and public.is_approved());

drop policy if exists "class_waitlist_delete_staff" on public.class_waitlist;
create policy "class_waitlist_delete_staff"
  on public.class_waitlist for delete to authenticated
  using (public.has_role(array['teacher', 'admin', 'tech']));

grant select, insert, delete on public.class_waitlist to authenticated;

-- Cap waitlist at 6; block if already enrolled.
create or replace function public.class_waitlist_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wait_count int;
begin
  if exists (
    select 1 from public.enrollments e
    where e.class_id = new.class_id and e.user_id = new.user_id
  ) then
    raise exception 'Already signed up for this class';
  end if;

  select count(*)::int into wait_count
  from public.class_waitlist
  where class_id = new.class_id;

  if wait_count >= 6 then
    raise exception 'Waitlist is full';
  end if;

  return new;
end;
$$;

drop trigger if exists class_waitlist_before_insert on public.class_waitlist;
create trigger class_waitlist_before_insert
  before insert on public.class_waitlist
  for each row execute function public.class_waitlist_before_insert();

-- Promote the next person (FIFO) into enrollments if a seat is free.
create or replace function public.promote_next_waitlist(p_class_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap int;
  v_count int;
  v_user uuid;
begin
  select capacity into v_cap
  from public.classes
  where id = p_class_id
  for update;

  if v_cap is null then
    return null;
  end if;

  select count(*)::int into v_count
  from public.enrollments
  where class_id = p_class_id;

  if v_count >= least(v_cap, 15) then
    return null;
  end if;

  select user_id into v_user
  from public.class_waitlist
  where class_id = p_class_id
  order by created_at asc
  for update skip locked
  limit 1;

  if v_user is null then
    return null;
  end if;

  insert into public.enrollments (class_id, user_id)
  values (p_class_id, v_user)
  on conflict do nothing;

  delete from public.class_waitlist
  where class_id = p_class_id and user_id = v_user;

  if not exists (
    select 1 from public.enrollments
    where class_id = p_class_id and user_id = v_user
  ) then
    return null;
  end if;

  return v_user;
end;
$$;

-- Staff: promote a specific waitlisted person (still requires a free seat).
create or replace function public.promote_waitlist_user(
  p_class_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap int;
  v_count int;
begin
  if not public.has_role(array['teacher', 'admin', 'tech']) then
    raise exception 'Not allowed';
  end if;

  select capacity into v_cap
  from public.classes
  where id = p_class_id
  for update;

  if v_cap is null then
    return false;
  end if;

  if not exists (
    select 1 from public.class_waitlist
    where class_id = p_class_id and user_id = p_user_id
  ) then
    return false;
  end if;

  select count(*)::int into v_count
  from public.enrollments
  where class_id = p_class_id;

  if v_count >= least(v_cap, 15) then
    raise exception 'Class is full';
  end if;

  insert into public.enrollments (class_id, user_id)
  values (p_class_id, p_user_id)
  on conflict do nothing;

  delete from public.class_waitlist
  where class_id = p_class_id and user_id = p_user_id;

  return exists (
    select 1 from public.enrollments
    where class_id = p_class_id and user_id = p_user_id
  );
end;
$$;

grant execute on function public.promote_next_waitlist(uuid) to authenticated;
grant execute on function public.promote_waitlist_user(uuid, uuid) to authenticated;
