-- Schedule-confirmed transport only. The existing inbox, policies and status RPC are unchanged.
begin;
create table public.parent_confirmed_push_settings (
 singleton boolean primary key default true check(singleton),
 mode text not null default 'off' check(mode in ('off','test','all')),
 test_parent_id uuid references public.profiles(id) on delete set null,
 test_device_ids uuid[] not null default '{}',
 test_class_id uuid,
 test_application_id uuid,
 test_started_at timestamptz
);
insert into public.parent_confirmed_push_settings(singleton) values(true);
alter table public.parent_confirmed_push_settings enable row level security;
revoke all on public.parent_confirmed_push_settings from public,anon,authenticated;
grant all on public.parent_confirmed_push_settings to service_role;

create table public.parent_confirmed_push_deliveries (
 id uuid primary key references public.application_logs(id) on delete cascade,
 notification_key text generated always as ('status:' || id::text) stored,
 application_id uuid not null references public.trial_applications(id) on delete cascade,
 parent_id uuid not null references public.profiles(id) on delete cascade,
 state text not null default 'pending' check(state in
 ('pending','sending','receipts','checking','fallback_ready','fallback_sending','delivered','fallback_done','unknown','canceled','test_suppressed')),
 -- Private snapshots bind receipts to the token that was actually sent, even after rotation.
 attempts jsonb not null default '[]' check(jsonb_typeof(attempts)='array'),
 suppress_legacy boolean not null default false,
 reason text,
 next_check_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.parent_confirmed_push_deliveries enable row level security;
revoke all on public.parent_confirmed_push_deliveries from public,anon,authenticated;
grant all on public.parent_confirmed_push_deliveries to service_role;
create index parent_confirmed_push_work on public.parent_confirmed_push_deliveries(state,next_check_at);

create function app.capture_confirmed_push()
returns trigger language plpgsql security definer set search_path='' as $$
declare cfg public.parent_confirmed_push_settings; a public.trial_applications;
begin
 if new.to_status is distinct from 'confirmed' or new.from_status is not distinct from new.to_status then return new; end if;
 select * into cfg from public.parent_confirmed_push_settings where singleton;
 if cfg.mode is null or cfg.mode='off' then return new; end if;
 select * into a from public.trial_applications where id=new.application_id;
 if a.status<>'confirmed' or a.parent_id is null or new.actor_id is not distinct from a.parent_id
  or not exists(select 1 from public.profiles where id=a.parent_id and role='parent')
  or exists(select 1 from app.parent_account_deletions where parent_id=a.parent_id) then return new; end if;
 if cfg.mode='test' and (a.parent_id is distinct from cfg.test_parent_id
  or a.id is distinct from cfg.test_application_id) then return new; end if;
 insert into public.parent_confirmed_push_deliveries(id,application_id,parent_id,suppress_legacy)
 values(new.id,a.id,a.parent_id,a.id is not distinct from cfg.test_application_id and a.parent_id is not distinct from cfg.test_parent_id)
 on conflict(id) do nothing;
 return new;
exception when others then
 -- A transport failure must not abort the schedule transaction or its inbox fact.
 raise warning 'confirmed_push_capture_failed'; return new;
end;
$$;
revoke all on function app.capture_confirmed_push() from public,anon,authenticated;
create trigger capture_confirmed_push after insert on public.application_logs
 for each row execute function app.capture_confirmed_push();

-- Atomic ownership shared by action after() and cron. Never reclaim a send/fallback.
create function public.claim_confirmed_push(p_id uuid,p_operation text)
returns setof public.parent_confirmed_push_deliveries language plpgsql security definer set search_path='' as $$
declare job public.parent_confirmed_push_deliveries; cfg public.parent_confirmed_push_settings;
begin
 select * into job from public.parent_confirmed_push_deliveries where id=p_id for update skip locked;
 if not found then return; end if;
 if p_operation='send' and job.state='pending' then
  select * into cfg from public.parent_confirmed_push_settings where singleton;
  if not exists(select 1 from public.trial_applications a join public.profiles p on p.id=a.parent_id
    where a.id=job.application_id and a.parent_id=job.parent_id and a.status='confirmed' and p.role='parent')
    or exists(select 1 from app.parent_account_deletions where parent_id=job.parent_id)
    or job.created_at<now()-interval '24 hours' then
   update public.parent_confirmed_push_deliveries set state='canceled',updated_at=now() where id=p_id;
   return;
  end if;
  if cfg.mode='off' or cfg.mode is null or (cfg.mode='test' and
    (job.parent_id is distinct from cfg.test_parent_id or job.application_id is distinct from cfg.test_application_id)) then
   return query update public.parent_confirmed_push_deliveries set state='fallback_ready',reason='gate_off',updated_at=now() where id=p_id returning *;
   return;
  end if;
  return query update public.parent_confirmed_push_deliveries set state='sending',updated_at=now(),
   attempts=coalesce((select jsonb_agg(jsonb_build_object('deviceId',d.id,'platform',d.platform,'token',d.expo_push_token,'sendStatus','reserved') order by d.id)
    from public.parent_push_devices d join auth.sessions s on s.id=d.session_id and s.user_id=d.parent_id
    where d.parent_id=job.parent_id and d.enabled and d.permission_status='granted' and d.expo_push_token is not null
     and (s.not_after is null or s.not_after>now())
     and (cfg.mode='all' or d.id=any(cfg.test_device_ids))), '[]'::jsonb)
   where id=p_id returning *;
 elsif p_operation='receipts' and ((job.state='receipts' and job.next_check_at<=now())
    or (job.state='checking' and job.updated_at<now()-interval '2 minutes')) then
  return query update public.parent_confirmed_push_deliveries set state='checking',updated_at=now() where id=p_id returning *;
 elsif p_operation='fallback' and job.state='fallback_ready' then
  if not exists(select 1 from public.trial_applications a join public.profiles p on p.id=a.parent_id
    where a.id=job.application_id and a.parent_id=job.parent_id and a.status='confirmed' and p.role='parent')
    or exists(select 1 from app.parent_account_deletions where parent_id=job.parent_id)
    or job.created_at<now()-interval '24 hours' then
   update public.parent_confirmed_push_deliveries set state='canceled',updated_at=now() where id=p_id;
   return;
  end if;
  return query update public.parent_confirmed_push_deliveries set state='fallback_sending',updated_at=now() where id=p_id returning *;
 end if;
end;
$$;
revoke all on function public.claim_confirmed_push(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_confirmed_push(uuid,text) to service_role;
commit;
