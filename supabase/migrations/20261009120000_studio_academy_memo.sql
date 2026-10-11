-- COMPAT, additive only. Production application requires separate approval.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Mutable private notes live outside immutable report source/snapshots.
-- Existing trial_results.note remains untouched and is read until the first memo save.
create table public.studio_academy_memos (
 application_id uuid primary key references public.trial_applications(id),
 note text check (length(note)<=10000),
 revision uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references public.profiles(id)
);
alter table public.studio_academy_memos enable row level security;
revoke all on public.studio_academy_memos from public,anon,authenticated;
grant select on public.studio_academy_memos to authenticated;
create policy studio_academy_memos_select_org on public.studio_academy_memos for select to authenticated
 using (app.current_role()='teacher' and public.is_org_trial_application(application_id));

create function public.get_studio_academy_memo(p_application_id uuid,p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.studio_academy_memos; r public.trial_results;
begin
 if not exists(select 1 from public.trial_applications a join public.classes c on c.id=a.class_id
  join public.profiles p on p.id=auth.uid() and p.organization_id=c.organization_id
  where a.id=p_application_id and c.organization_id=p_organization_id and p.role in ('academy','admin')) then
  raise exception 'application_not_found_or_forbidden';
 end if;
 select * into m from public.studio_academy_memos where application_id=p_application_id;
 if found then return jsonb_build_object('note',m.note,'revision','memo:'||m.revision::text); end if;
 select * into r from public.trial_results where application_id=p_application_id;
 return jsonb_build_object('note',r.note,'revision','legacy:'||coalesce(r.updated_at::text,''));
end $$;

-- Scalar memo-only payload. No source, snapshot, registration or activity writes.
create function public.save_studio_academy_memo(p_application_id uuid,p_note text,p_expected_revision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.trial_applications; current_memo jsonb; m public.studio_academy_memos; org uuid;
begin
 -- Reuse the exact existing own-org/completed/non-canceled/non-no-show guard and lock order.
 a:=public.workflow_studio_application(p_application_id);
 select organization_id into org from public.classes where id=a.class_id;
 current_memo:=public.get_studio_academy_memo(a.id,org);
 if p_expected_revision is distinct from current_memo->>'revision' then raise exception 'academy_memo_changed'; end if;
 if length(p_note)>10000 then raise exception 'academy_memo_too_long'; end if;
 if current_memo->>'note' is not distinct from nullif(btrim(p_note),'') then return current_memo; end if;
 insert into public.studio_academy_memos(application_id,note,updated_by)
 values(a.id,nullif(btrim(p_note),''),auth.uid())
 on conflict(application_id) do update set note=excluded.note,updated_by=excluded.updated_by,
  updated_at=clock_timestamp(),revision=gen_random_uuid()
 returning * into m;
 return jsonb_build_object('note',m.note,'revision','memo:'||m.revision::text);
end $$;
revoke all on function public.get_studio_academy_memo(uuid,uuid) from public,anon;
revoke all on function public.save_studio_academy_memo(uuid,text,text) from public,anon;
grant execute on function public.get_studio_academy_memo(uuid,uuid) to authenticated;
grant execute on function public.save_studio_academy_memo(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
