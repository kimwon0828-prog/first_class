create unique index if not exists class_schedules_one_time_unique_slot_idx
  on public.class_schedules (class_id, specific_date, start_time)
  where schedule_type = 'one_time';

create unique index if not exists class_schedules_weekly_unique_slot_idx
  on public.class_schedules (class_id, day_of_week, start_time)
  where schedule_type = 'weekly';
