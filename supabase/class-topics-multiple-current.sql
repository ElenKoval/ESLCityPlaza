-- Allow several Current topics at once (e.g. this week's and next weeks').
-- Publishing a topic no longer moves the previous Current topic to Past.
drop index if exists public.class_topics_one_current_idx;
