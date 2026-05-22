alter table public.trial_applications
  add column if not exists registration_status text not null default 'undecided',
  add column if not exists registered_course text,
  add column if not exists unregistered_reason text,
  add column if not exists follow_up_note text;

alter table public.trial_applications
  add constraint trial_applications_registration_status_check
  check (
    registration_status in ('undecided', 'enrolled', 'not_enrolled', 'pending')
  );

alter table public.trial_applications
  add constraint trial_applications_unregistered_reason_check
  check (
    unregistered_reason is null
    or unregistered_reason in (
      'schedule_mismatch',
      'cost_burden',
      'distance',
      'child_reaction',
      'comparing_other_academies',
      'no_response',
      'other'
    )
  );

alter table public.trial_applications
  add constraint trial_applications_unregistered_reason_status_check
  check (
    unregistered_reason is null
    or registration_status = 'not_enrolled'
  );

create index if not exists trial_applications_registration_status_created_at_idx
  on public.trial_applications (registration_status, created_at desc);
