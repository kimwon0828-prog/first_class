alter table public.profiles
  add column if not exists parent_birth_date date;
