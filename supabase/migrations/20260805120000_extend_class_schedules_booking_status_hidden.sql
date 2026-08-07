alter table public.class_schedules
  drop constraint if exists class_schedules_booking_status_check;

alter table public.class_schedules
  add constraint class_schedules_booking_status_check
  check (booking_status in ('open', 'closed', 'hidden'));
