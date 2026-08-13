-- If you already ran the old schema, run this once in Supabase SQL Editor:

drop policy if exists "classes_select_approved" on public.classes;

create policy "classes_select_public"
  on public.classes for select
  using (true);
