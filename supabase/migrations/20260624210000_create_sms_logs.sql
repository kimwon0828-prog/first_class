create table if not exists public.sms_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trial_application_id uuid references public.trial_applications(id) on delete set null,
  class_id uuid references public.classes(id) on delete set null,
  teacher_id uuid references public.teachers(id) on delete set null,
  recipient_type text not null,
  recipient_name text,
  recipient_phone_masked text,
  event_type text not null,
  template_key text not null,
  message_preview text,
  status text not null,
  provider text,
  provider_message_id text,
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint sms_logs_recipient_type_check
    check (recipient_type in ('parent', 'teacher')),
  constraint sms_logs_event_type_check
    check (
      event_type in (
        'trial_contact_started',
        'trial_schedule_confirmed',
        'trial_completed',
        'trial_enrolled',
        'trial_reminder',
        'teacher_trial_assigned',
        'teacher_trial_schedule_confirmed',
        'teacher_trial_schedule_updated',
        'teacher_trial_canceled'
      )
    ),
  constraint sms_logs_status_check
    check (status in ('dry_run', 'pending', 'sent', 'failed', 'skipped')),
  constraint sms_logs_provider_check
    check (provider is null or provider in ('dry_run'))
);

create index if not exists sms_logs_org_created_at_idx
  on public.sms_logs (organization_id, created_at desc);

create index if not exists sms_logs_application_created_at_idx
  on public.sms_logs (trial_application_id, created_at desc);

create index if not exists sms_logs_teacher_created_at_idx
  on public.sms_logs (teacher_id, created_at desc)
  where teacher_id is not null;

alter table public.sms_logs enable row level security;

revoke all on table public.sms_logs from anon;
revoke all on table public.sms_logs from authenticated;
grant select on table public.sms_logs to authenticated;

drop policy if exists sms_logs_authenticated_read_same_org on public.sms_logs;
create policy sms_logs_authenticated_read_same_org
on public.sms_logs
for select
to authenticated
using (
  app.current_org_id() is not null
  and organization_id = app.current_org_id()
  and app.current_role() in ('teacher', 'operator')
);
