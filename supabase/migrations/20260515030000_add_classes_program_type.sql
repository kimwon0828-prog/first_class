do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'classes'
      and column_name = 'program_type'
  ) then
    alter table public.classes
      add column program_type text not null default 'trial_class';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'classes_program_type_check'
      and conrelid = 'public.classes'::regclass
  ) then
    alter table public.classes
      add constraint classes_program_type_check
      check (program_type in ('trial_class', 'level_test'));
  end if;
end
$$;

create index if not exists classes_organization_program_type_idx
  on public.classes (organization_id, program_type, created_at desc);
