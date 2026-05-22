drop policy if exists application_logs_parent_insert_self on public.application_logs;

create policy application_logs_parent_insert_self
on public.application_logs
for insert
to authenticated
with check (
  actor_id = auth.uid()
  and exists (
    select 1
    from public.trial_applications ta
    where ta.id = application_logs.application_id
      and ta.parent_id = auth.uid()
  )
);
