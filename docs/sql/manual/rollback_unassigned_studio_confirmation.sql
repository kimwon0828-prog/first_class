-- Only when no blockless confirmed/completed rows remain. Never normalize history automatically.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.trial_applications IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.trial_applications
    WHERE NOT (
      (confirmed_slot_at IS NULL AND confirmed_schedule_block_id IS NULL)
      OR (
        confirmed_slot_at IS NOT NULL
        AND confirmed_schedule_block_id IS NOT NULL
        AND status IN ('confirmed', 'completed')
      )
    )
  ) THEN
    RAISE EXCEPTION 'rollback_blocked_by_blockless_confirmations';
  END IF;
END;
$$;
ALTER TABLE public.trial_applications
  DROP CONSTRAINT trial_applications_confirmed_state_check;
ALTER TABLE public.trial_applications
  ADD CONSTRAINT trial_applications_confirmed_state_check CHECK (
    (confirmed_slot_at IS NULL AND confirmed_schedule_block_id IS NULL)
    OR (
      confirmed_slot_at IS NOT NULL
      AND confirmed_schedule_block_id IS NOT NULL
      AND status IN ('confirmed', 'completed')
    )
  );
DROP FUNCTION public.set_studio_application_schedule(uuid,text,uuid,timestamptz);
COMMIT;
