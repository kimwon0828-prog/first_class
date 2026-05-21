alter table public.trial_applications
  add column if not exists requested_schedule_block_id uuid references public.schedule_blocks(id) on delete set null,
  add column if not exists parent_name text,
  add column if not exists parent_phone text,
  add column if not exists child_school text,
  add column if not exists child_notes text,
  add column if not exists subject_experience_yn boolean,
  add column if not exists subject_experience_duration text,
  add column if not exists current_level text,
  add column if not exists preferred_regular_schedule text,
  add column if not exists goal_type text,
  add column if not exists goal_note text,
  add column if not exists consultation_note text,
  add column if not exists trial_feedback text,
  add column if not exists final_level text,
  add column if not exists final_schedule text;

create index if not exists trial_applications_requested_schedule_block_id_idx
  on public.trial_applications (requested_schedule_block_id);

create index if not exists trial_applications_status_created_at_idx
  on public.trial_applications (status, created_at desc);
