-- Fixed taxonomy; no labels, notes, authors or application identities in public summaries.
create or replace function app.experience_feedback_taxonomy()
returns table(chip_id text, scope text, ordinal integer, level_test_allowed boolean)
language sql immutable set search_path = '' as $$
  values
    ('child_enjoyed','CLASS',1,true),
    ('child_focused','CLASS',2,false),
    ('child_participated','CLASS',3,true),
    ('good_child_fit','CLASS',4,true),
    ('good_level_fit','CLASS',5,true),
    ('understood_child','BOTH',6,true),
    ('clear_instruction','CLASS',7,true),
    ('structured_lesson','CLASS',8,false),
    ('interesting_activities','CLASS',9,false),
    ('good_hands_on','CLASS',10,false),
    ('kind_teacher','BOTH',11,true),
    ('tailored_guidance','CLASS',12,true),
    ('attentive_teacher','BOTH',13,true),
    ('specific_feedback','BOTH',14,true),
    ('kind_consultation','ACADEMY',15,true),
    ('clear_consultation','ACADEMY',16,true),
    ('clean_facilities','ACADEMY',17,true),
    ('comfortable_atmosphere','ACADEMY',18,true);
$$;
revoke all on function app.experience_feedback_taxonomy() from public, anon, authenticated;

create or replace function app.valid_experience_feedback_chips(p_ids text[], p_program text)
returns boolean language sql immutable security definer set search_path = '' as $$
  select p_ids is not null and p_program in ('trial_class','level_test')
    and cardinality(p_ids) <= 5 and coalesce(array_ndims(p_ids),1)=1
    and not exists (select 1 from unnest(p_ids) id where id is null)
    and cardinality(p_ids)=(select count(distinct id) from unnest(p_ids) id)
    and not exists (select 1 from unnest(p_ids) id where not exists (
      select 1 from app.experience_feedback_taxonomy() t where t.chip_id=id
        and (p_program='trial_class' or t.level_test_allowed)));
$$;
revoke all on function app.valid_experience_feedback_chips(text[],text) from public, anon, authenticated;

-- Match JavaScript trim for direct RPC callers too (including Unicode whitespace).
create or replace function app.normalize_experience_feedback_note(p_note text)
returns text language sql immutable set search_path = '' as $$
  select nullif(btrim(p_note, E' \t\n\r\f\v' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'');
$$;
revoke all on function app.normalize_experience_feedback_note(text) from public,anon,authenticated;

create table if not exists public.experience_feedback (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.trial_applications(id) on delete cascade,
  parent_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  program_type text not null check(program_type in ('trial_class','level_test')),
  selected_chip_ids text[] not null default '{}',
  private_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experience_feedback_chips_check check(app.valid_experience_feedback_chips(selected_chip_ids,program_type)),
  constraint experience_feedback_note_check check(private_note is null or (char_length(private_note) between 1 and 1000 and private_note is not distinct from app.normalize_experience_feedback_note(private_note))),
  constraint experience_feedback_submission_check check(cardinality(selected_chip_ids)>0 or private_note is not null)
);
alter table public.experience_feedback drop constraint if exists experience_feedback_note_check;
alter table public.experience_feedback add constraint experience_feedback_note_check check(private_note is null or (char_length(private_note) between 1 and 1000 and private_note is not distinct from app.normalize_experience_feedback_note(private_note)));
create index if not exists experience_feedback_class_idx on public.experience_feedback(class_id);
create index if not exists experience_feedback_org_idx on public.experience_feedback(organization_id);
alter table public.experience_feedback enable row level security;
revoke all on public.experience_feedback from public, anon, authenticated;
grant select on public.experience_feedback to authenticated;
grant all on public.experience_feedback to service_role;

-- Both author and current application context must agree. Ownership transfer never
-- forwards an old private note to a new household or a new organization.
create or replace function app.can_read_experience_feedback(p_application uuid,p_parent uuid,p_class uuid,p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.trial_applications a join public.classes c on c.id=a.class_id
    where a.id=p_application and a.parent_id=p_parent and a.class_id=p_class and c.organization_id=p_org
      and ((app.current_role()='parent' and p_parent=auth.uid())
        or (app.current_role()='teacher' and p_org=app.current_org_id())));
$$;
revoke all on function app.can_read_experience_feedback(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function app.can_read_experience_feedback(uuid,uuid,uuid,uuid) to authenticated;
drop policy if exists experience_feedback_read_context on public.experience_feedback;
create policy experience_feedback_read_context on public.experience_feedback for select to authenticated
using(app.can_read_experience_feedback(application_id,parent_id,class_id,organization_id));

create or replace function app.guard_experience_feedback_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.application_id,new.parent_id,new.class_id,new.organization_id,new.program_type,new.created_at)
    is distinct from (old.application_id,old.parent_id,old.class_id,old.organization_id,old.program_type,old.created_at)
    then raise exception 'feedback_snapshot_immutable'; end if;
  return new;
end;
$$;
revoke all on function app.guard_experience_feedback_snapshot() from public,anon,authenticated;
drop trigger if exists guard_experience_feedback_snapshot on public.experience_feedback;
create trigger guard_experience_feedback_snapshot before update on public.experience_feedback
for each row execute function app.guard_experience_feedback_snapshot();

-- A safe eligibility result, without expanding my_trial_applications with internal fields.
create or replace function public.get_parent_experience_feedback_context(p_application_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.trial_applications%rowtype; c public.classes%rowtype; f public.experience_feedback%rowtype; program text;
begin
  if auth.uid() is null or app.current_role() is distinct from 'parent' then raise exception 'feedback_forbidden'; end if;
  select * into a from public.trial_applications where id=p_application_id and parent_id=auth.uid();
  if not found then raise exception 'feedback_forbidden'; end if;
  select * into c from public.classes where id=a.class_id;
  select * into f from public.experience_feedback where application_id=a.id;
  if f.id is not null and (f.parent_id,f.class_id,f.organization_id) is distinct from (a.parent_id,a.class_id,c.organization_id) then
    raise exception 'feedback_context_changed'; end if;
  program := coalesce(f.program_type,c.program_type);
  return jsonb_build_object('eligible',a.status='completed' and a.no_show_at is null and a.canceled_at is null and program in ('trial_class','level_test'),
    'programType',case when program in ('trial_class','level_test') then program else null end,
    'feedback',case when f.id is null then null else jsonb_build_object('selectedChipIds',f.selected_chip_ids,'privateNote',f.private_note,'createdAt',f.created_at,'updatedAt',f.updated_at) end);
end;
$$;
revoke all on function public.get_parent_experience_feedback_context(uuid) from public,anon;
grant execute on function public.get_parent_experience_feedback_context(uuid) to authenticated;

create or replace function public.save_parent_experience_feedback(p_application_id uuid,p_selected_chip_ids text[],p_private_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.trial_applications%rowtype; c public.classes%rowtype; f public.experience_feedback%rowtype;
  v_class uuid; v_program text; v_note text := app.normalize_experience_feedback_note(p_private_note);
begin
  if auth.uid() is null or app.current_role() is distinct from 'parent' then raise exception 'feedback_forbidden'; end if;
  select class_id into v_class from public.trial_applications where id=p_application_id and parent_id=auth.uid();
  if not found then raise exception 'feedback_forbidden'; end if;
  -- Same class -> application lock order as schedule mutations. Stable source snapshots.
  select * into c from public.classes where id=v_class for share;
  select * into a from public.trial_applications where id=p_application_id and parent_id=auth.uid() for update;
  if not found or a.class_id<>v_class then raise exception 'feedback_forbidden'; end if;
  if a.status<>'completed' or a.no_show_at is not null or a.canceled_at is not null then raise exception 'feedback_not_eligible'; end if;
  select * into f from public.experience_feedback where application_id=a.id;
  if f.id is not null and (f.parent_id,f.class_id,f.organization_id) is distinct from (a.parent_id,a.class_id,c.organization_id) then
    raise exception 'feedback_context_changed'; end if;
  v_program := coalesce(f.program_type,c.program_type);
  if not coalesce(app.valid_experience_feedback_chips(p_selected_chip_ids,v_program),false)
    or (cardinality(p_selected_chip_ids)=0 and v_note is null) or char_length(v_note)>1000 then raise exception 'feedback_invalid_input'; end if;
  insert into public.experience_feedback(application_id,parent_id,class_id,organization_id,program_type,selected_chip_ids,private_note)
    values(a.id,auth.uid(),a.class_id,c.organization_id,v_program,p_selected_chip_ids,v_note)
    on conflict(application_id) do update set selected_chip_ids=excluded.selected_chip_ids,private_note=excluded.private_note,updated_at=clock_timestamp();
end;
$$;
revoke all on function public.save_parent_experience_feedback(uuid,text[],text) from public,anon;
grant execute on function public.save_parent_experience_feedback(uuid,text[],text) to authenticated;

-- Internal fixed-scope aggregate. No public EXECUTE on this helper; wrappers accept
-- only one canonical entity ID, with no date, child, author or arbitrary filter.
create or replace function app.public_experience_feedback_summary(p_scope text,p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with taxonomy as (
    select * from app.experience_feedback_taxonomy() where scope in (p_scope,'BOTH')
  ), eligible as (
    select f.application_id,f.parent_id,f.selected_chip_ids from public.experience_feedback f
    join public.trial_applications a on a.id=f.application_id and a.parent_id=f.parent_id and a.class_id=f.class_id
    join public.classes c on c.id=a.class_id and c.organization_id=f.organization_id
    where a.status='completed' and a.canceled_at is null and a.no_show_at is null
      and ((p_scope='CLASS' and f.class_id=p_id and c.is_active) or (p_scope='ACADEMY' and f.organization_id=p_id))
      and exists(select 1 from taxonomy t where t.chip_id=any(f.selected_chip_ids))
  ), threshold as (
    select count(distinct application_id)>=3 and count(distinct parent_id)>=3 as visible from eligible
  ), chips as (
    select t.chip_id,t.ordinal,count(distinct e.application_id)::integer as count from taxonomy t
      join eligible e on t.chip_id=any(e.selected_chip_ids)
      where (select visible from threshold)
      group by t.chip_id,t.ordinal having count(distinct e.parent_id)>=3
      order by count desc,t.ordinal limit 6
  ) select jsonb_build_object('chips',coalesce(jsonb_agg(jsonb_build_object('id',chip_id,'count',count) order by count desc,ordinal),'[]'::jsonb)) from chips;
$$;
revoke all on function app.public_experience_feedback_summary(text,uuid) from public,anon,authenticated;
create or replace function public.get_public_class_feedback_summary(p_class_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select app.public_experience_feedback_summary('CLASS',p_class_id);
$$;
create or replace function public.get_public_academy_feedback_summary(p_organization_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select app.public_experience_feedback_summary('ACADEMY',p_organization_id);
$$;
revoke all on function public.get_public_class_feedback_summary(uuid),public.get_public_academy_feedback_summary(uuid) from public;
grant execute on function public.get_public_class_feedback_summary(uuid),public.get_public_academy_feedback_summary(uuid) to anon,authenticated;
notify pgrst,'reload schema';
