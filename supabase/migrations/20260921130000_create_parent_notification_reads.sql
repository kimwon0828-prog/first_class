-- Additive parent-only presentation state. Event sources remain unchanged.
create table public.parent_notification_reads (
  parent_id uuid not null references public.profiles(id) on delete cascade,
  notification_key text not null,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (parent_id, notification_key),
  constraint parent_notification_reads_key_check check (
    notification_key ~ '^(status|report_published):[0-9a-fA-F-]{36}$'
  )
);

-- Invoker rights preserve source RLS; no CRM or Studio bypass.
create function public.parent_notification_key_is_visible(p_key text)
returns boolean language sql stable security invoker set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'parent')
  and (
    exists (
      select 1 from public.application_logs l
      join public.my_trial_applications a on a.id = l.application_id
      where a.parent_id = auth.uid() and p_key = 'status:' || l.id::text
        and l.to_status in ('reviewing', 'confirmed', 'canceled', 'completed')
        and l.from_status is distinct from l.to_status
        and l.actor_id is distinct from auth.uid() and l.created_at is not null
    ) or exists (
      select 1 from public.experience_reports r
      join public.my_trial_applications a on a.id = r.application_id
      where a.parent_id = auth.uid() and p_key = 'report_published:' || r.id::text
        and r.status = 'published' and r.published_at is not null
    )
  );
$$;
revoke all on function public.parent_notification_key_is_visible(text) from public, anon;
grant execute on function public.parent_notification_key_is_visible(text) to authenticated;
alter table public.parent_notification_reads enable row level security;
revoke all on public.parent_notification_reads from anon, authenticated;
grant select, insert, update on public.parent_notification_reads to authenticated;
create policy parent_notification_reads_select_own on public.parent_notification_reads
  for select to authenticated using (
    parent_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'parent')
  );
create policy parent_notification_reads_insert_own on public.parent_notification_reads
  for insert to authenticated with check (
    parent_id = auth.uid() and public.parent_notification_key_is_visible(notification_key)
  );
create policy parent_notification_reads_update_own on public.parent_notification_reads
  for update to authenticated using (parent_id = auth.uid()) with check (
    parent_id = auth.uid() and public.parent_notification_key_is_visible(notification_key)
  );
comment on table public.parent_notification_reads is
  'Parent read receipts for derived event keys; orphan receipts are inert and retained. Not ParentDecision.';
