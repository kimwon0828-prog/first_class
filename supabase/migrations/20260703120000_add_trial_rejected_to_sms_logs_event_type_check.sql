alter table public.sms_logs
  drop constraint if exists sms_logs_event_type_check;

alter table public.sms_logs
  add constraint sms_logs_event_type_check
  check (
    event_type in (
      'trial_contact_started',
      'trial_rejected',
      'trial_schedule_confirmed',
      'trial_completed',
      'trial_enrolled',
      'trial_reminder',
      'teacher_trial_requested',
      'teacher_trial_assigned',
      'teacher_trial_schedule_confirmed',
      'teacher_trial_schedule_updated',
      'teacher_trial_canceled'
    )
  );
