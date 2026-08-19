do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'consultation_logs'
      and column_name = 'registration_status_snapshot'
  ) then
    alter table public.consultation_logs
      add column registration_status_snapshot text;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relname = 'consultation_logs'
      and con.conname = 'consultation_logs_sentiment_check'
  ) then
    alter table public.consultation_logs
      add constraint consultation_logs_sentiment_check
      check (
        sentiment is null
        or sentiment in ('POSITIVE', 'NEUTRAL', 'NEGATIVE')
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relname = 'consultation_logs'
      and con.conname = 'consultation_logs_registration_status_snapshot_check'
  ) then
    alter table public.consultation_logs
      add constraint consultation_logs_registration_status_snapshot_check
      check (
        registration_status_snapshot is null
        or registration_status_snapshot in (
          'undecided',
          'pending',
          'enrolled',
          'not_enrolled'
        )
      );
  end if;
end
$$;

grant update (sentiment)
on table public.consultation_logs
to authenticated;
