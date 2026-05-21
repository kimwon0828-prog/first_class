do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'schedule_blocks'
      and column_name = 'class_id'
  ) then
    alter table public.schedule_blocks
      add column class_id uuid references public.classes(id) on delete cascade;
  end if;
end
$$;

create index if not exists schedule_blocks_class_id_start_at_idx
  on public.schedule_blocks (class_id, start_at);

drop policy if exists schedule_blocks_parent_read_public_available_for_active_classes
  on public.schedule_blocks;

create policy schedule_blocks_parent_read_public_available_for_active_classes
on public.schedule_blocks
for select
to authenticated
using (
  app.current_role() = 'parent'
  and type = 'available'
  and start_at > now()
  and (
    (
      class_id is not null
      and exists (
        select 1
        from public.classes c
        where c.id = schedule_blocks.class_id
          and c.is_active = true
      )
    )
    or (
      class_id is null
      and exists (
        select 1
        from public.classes c
        where c.teacher_id = schedule_blocks.teacher_id
          and c.is_active = true
      )
    )
  )
);
