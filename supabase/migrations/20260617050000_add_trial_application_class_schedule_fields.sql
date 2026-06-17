alter table public.trial_applications
  add column if not exists class_schedule_id uuid null
    references public.class_schedules(id) on delete set null,
  add column if not exists selected_schedule_label text null;

create index if not exists trial_applications_class_schedule_id_idx
  on public.trial_applications (class_schedule_id);
