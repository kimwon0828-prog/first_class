alter table public.classes
  add column if not exists class_format text,
  add column if not exists recommended_for text,
  add column if not exists experience_points text,
  add column if not exists curriculum text,
  add column if not exists teacher_intro text;

