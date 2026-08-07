alter table public.class_schedules
  add column if not exists booking_status text not null default 'open';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'class_schedules_booking_status_check'
  ) then
    alter table public.class_schedules
      add constraint class_schedules_booking_status_check
      check (booking_status in ('open', 'closed'));
  end if;
end $$;

create index if not exists class_schedules_booking_status_idx
  on public.class_schedules (booking_status);

create index if not exists class_schedules_one_time_booking_lookup_idx
  on public.class_schedules (class_id, specific_date, booking_status)
  where schedule_type = 'one_time';
