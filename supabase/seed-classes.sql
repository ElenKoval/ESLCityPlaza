-- If class sign-up shows “No session listed”, run this once in SQL Editor.

insert into public.classes (title, description, starts_at, capacity)
select
  case when extract(dow from d) = 1 then 'Monday Session' else 'Friday Session' end,
  '1:00 PM – 3:00 PM practice with the group',
  ((d + time '13:00') at time zone 'America/Los_Angeles'),
  15
from generate_series(
  current_date,
  (current_date + interval '56 days')::date,
  interval '1 day'
) as g(d)
where extract(dow from d) in (1, 5)
  and ((d + time '13:00') at time zone 'America/Los_Angeles') > now()
  and not exists (
    select 1
    from public.classes c
    where c.starts_at = ((d + time '13:00') at time zone 'America/Los_Angeles')
  );
