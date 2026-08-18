-- Conversations on the Plaza — cleanup incorrect/duplicate class times
-- Run once in Supabase SQL Editor AFTER deploying the timezone code.
-- Does not recreate the schedule. Does not change location on correct meetings.
-- Protects Monday 2026-09-14 1:00 PM Pacific (Rengstorff Park).
--
-- Correct meeting = Monday or Friday, 1:00 PM America/Los_Angeles.
-- Incorrect duplicate = typically UTC midnight of that Monday/Friday
-- (shows as the previous evening in California).

begin;

create temporary table _class_labeled as
select
  id,
  title,
  location,
  starts_at,
  (starts_at at time zone 'America/Los_Angeles') as la_ts,
  (starts_at at time zone 'America/Los_Angeles')::date as la_date,
  extract(dow from starts_at at time zone 'America/Los_Angeles')::int as la_dow,
  extract(hour from starts_at at time zone 'America/Los_Angeles')::int as la_hour,
  (starts_at at time zone 'UTC')::date as utc_date
from public.classes;

create temporary table _class_correct as
select *
from _class_labeled
where la_dow in (1, 5)
  and la_hour = 13;

-- Incorrect rows whose California weekday is still Mon/Fri but not 1:00 PM:
-- retarget to that same LA date.
-- Other incorrect rows (Thu/Sun evenings): retarget to the UTC calendar date
-- if that date is a Monday/Friday (the intended session).
create temporary table _class_incorrect as
select
  i.*,
  case
    when i.la_dow in (1, 5) then i.la_date
    when extract(dow from i.utc_date)::int in (1, 5) then i.utc_date
    else null
  end as target_la_date
from _class_labeled i
where not (i.la_dow in (1, 5) and i.la_hour = 13);

create temporary table _class_pairs as
select
  i.id as bad_id,
  c.id as good_id,
  i.target_la_date
from _class_incorrect i
join _class_correct c
  on c.la_date = i.target_la_date
where i.target_la_date is not null
  and i.id <> c.id
  -- Never treat the protected Sep 14 1:00 PM meeting as a duplicate to delete.
  and not (
    i.la_date = date '2026-09-14'
    and i.la_dow = 1
    and i.la_hour = 13
  );

-- Move sign-ups onto the correct meeting (keep existing sign-ups there).
insert into public.enrollments (class_id, user_id)
select p.good_id, e.user_id
from _class_pairs p
join public.enrollments e on e.class_id = p.bad_id
on conflict (class_id, user_id) do nothing;

delete from public.enrollments e
using _class_pairs p
where e.class_id = p.bad_id;

-- Move a topic only when the correct meeting does not already have one.
update public.class_topics t
set class_id = p.good_id
from _class_pairs p
where t.class_id = p.bad_id
  and not exists (
    select 1 from public.class_topics t2 where t2.class_id = p.good_id
  );

-- Same-day Mon/Fri rows at the wrong hour, with no 1:00 PM twin yet:
-- snap time to 1:00 PM Pacific. Location/title stay as-is except title weekday.
update public.classes c
set
  starts_at = ((i.la_date + time '13:00') at time zone 'America/Los_Angeles'),
  title = case
    when i.la_dow = 1 then 'Monday Session'
    when i.la_dow = 5 then 'Friday Session'
    else c.title
  end
from _class_incorrect i
where c.id = i.id
  and i.la_dow in (1, 5)
  and i.la_hour <> 13
  and i.target_la_date is not null
  and not exists (
    select 1 from _class_correct c2 where c2.la_date = i.la_date
  )
  and not (
    i.la_date = date '2026-09-14'
    and i.la_dow = 1
    and i.la_hour = 13
  );

-- Delete remaining incorrect duplicates that now have a correct twin.
-- Skip any class that still has a topic attached (would lose it).
delete from public.classes c
using _class_pairs p
where c.id = p.bad_id
  and not exists (
    select 1 from public.class_topics t where t.class_id = p.bad_id
  )
  and c.id not in (
    select id from public.classes
    where (starts_at at time zone 'America/Los_Angeles')::date = date '2026-09-14'
      and extract(dow from starts_at at time zone 'America/Los_Angeles') = 1
      and extract(hour from starts_at at time zone 'America/Los_Angeles') = 13
  );

commit;

-- After this runs, confirm:
-- select title, location, starts_at at time zone 'America/Los_Angeles'
-- from public.classes
-- where (starts_at at time zone 'America/Los_Angeles')::date = date '2026-09-14';
-- Expected: Monday Session, Rengstorff Park, 2026-09-14 13:00:00
