-- Run once in Supabase SQL Editor (existing project).

alter table public.profiles
  add column if not exists hometown text not null default '';

alter table public.profiles
  add column if not exists languages text[] not null default '{}';

alter table public.profiles
  add column if not exists interests text[] not null default '{}';

alter table public.profiles
  add column if not exists bio text not null default '';

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;
