-- Run once in Supabase SQL Editor (existing project).

alter table public.classes
  add column if not exists location text not null default 'on the Plaza';
