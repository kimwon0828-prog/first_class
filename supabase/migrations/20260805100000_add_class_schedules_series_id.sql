alter table public.class_schedules
  add column if not exists series_id uuid null;

create index if not exists class_schedules_series_id_idx
  on public.class_schedules (series_id);

create index if not exists class_schedules_one_time_lookup_idx
  on public.class_schedules (class_id, specific_date, start_time)
  where schedule_type = 'one_time';

create index if not exists class_schedules_weekly_lookup_idx
  on public.class_schedules (class_id, day_of_week, start_time)
  where schedule_type = 'weekly';
