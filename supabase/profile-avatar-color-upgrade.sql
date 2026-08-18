-- Conversations on the Plaza — profile avatar color
-- Run once in Supabase SQL Editor.
-- Members pick one of six avatar colors. Default is terracotta.

alter table public.profiles
  add column if not exists avatar_color text not null default '#c4510c';

alter table public.profiles
  drop constraint if exists profiles_avatar_color_check;

alter table public.profiles
  add constraint profiles_avatar_color_check
  check (
    avatar_color in (
      '#c4510c',
      '#2f6f4e',
      '#3d5a80',
      '#9a3412',
      '#6b3fa0',
      '#0f766e'
    )
  );
