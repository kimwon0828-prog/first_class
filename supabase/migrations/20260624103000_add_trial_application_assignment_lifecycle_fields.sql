do $$
begin
  alter table public.trial_applications
    add column if not exists contacted_at timestamptz,
    add column if not exists scheduled_at timestamptz,
    add column if not exists completed_at timestamptz,
    add column if not exists enrolled_at timestamptz,
    add column if not exists canceled_at timestamptz,
    add column if not exists no_show_at timestamptz;
end
$$;

update public.trial_applications ta
set assigned_teacher_id = c.teacher_id
from public.classes c
where ta.class_id = c.id
  and ta.assigned_teacher_id is null
  and c.teacher_id is not null;

create index if not exists trial_applications_confirmed_slot_at_idx
  on public.trial_applications (confirmed_slot_at desc);
