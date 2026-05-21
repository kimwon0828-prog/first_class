alter table public.classes
  add column if not exists teacher_display_name text,
  add column if not exists cover_image_url text;
