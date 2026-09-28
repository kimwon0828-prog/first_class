-- Unassigned class-schedule confirmations; no table/column/status/RLS changes.
-- The original two CHECK branches are preserved verbatim in meaning.
alter table public.trial_applications drop constraint trial_applications_confirmed_state_check;
alter table public.trial_applications add constraint trial_applications_confirmed_state_check check (
  (confirmed_slot_at is null and confirmed_schedule_block_id is null)
  or (confirmed_slot_at is not null and confirmed_schedule_block_id is not null and status in ('confirmed','completed'))
  or (confirmed_slot_at is not null and confirmed_schedule_block_id is null
      and assigned_teacher_id is null and class_schedule_id is not null and status in ('confirmed','completed'))
);

-- Invoker uses the existing organization-scoped updatable view and block RLS.
-- Class -> application -> teacher locks serialize this writer with rolling rules
-- and concurrent confirms/assignments without widening database privileges.
create function public.set_studio_application_schedule(
  p_application_id uuid,
  p_operation text,
  p_teacher_id uuid,
  p_expected_updated_at timestamptz
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_org uuid;
  v_role text;
  v_class uuid;
  v_app public.trial_applications%rowtype;
  v_schedule public.class_schedules%rowtype;
  v_source public.schedule_blocks%rowtype;
  v_block uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_capacity integer;
  v_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select organization_id,role into v_org,v_role from public.profiles where id=v_actor;
  if v_org is null or v_role not in ('academy','admin') or v_role is null then
    raise exception 'application_not_found_or_forbidden';
  end if;
  if p_operation not in ('confirm','assign') or p_operation is null or p_expected_updated_at is null then
    raise exception 'invalid_schedule_operation';
  end if;
  select a.class_id into v_class from public.studio_trial_applications a
    join public.classes c on c.id=a.class_id where a.id=p_application_id and c.organization_id=v_org;
  if not found then raise exception 'application_not_found_or_forbidden'; end if;
  perform 1 from public.classes where id=v_class and organization_id=v_org for no key update;
  select * into v_app from public.studio_trial_applications where id=p_application_id for update;
  if not found or v_app.class_id <> v_class then raise exception 'application_not_found_or_forbidden'; end if;
  if v_app.updated_at is distinct from p_expected_updated_at then raise exception 'application_status_conflict'; end if;
  if p_operation='confirm' and v_app.status not in ('new','reviewing') then raise exception 'application_status_conflict'; end if;
  if p_operation='assign' and v_app.status='canceled' then raise exception 'application_status_conflict'; end if;

  if p_teacher_id is not null then
    perform 1 from public.teachers where id=p_teacher_id and organization_id=v_org and is_active and profile_id is null for update;
    if not found then raise exception 'invalid_teacher_for_application_organization'; end if;
  end if;
  -- Before confirmation assignment remains supported for legacy callers.
  if p_operation='assign' and v_app.status in ('new','reviewing') then
    update public.studio_trial_applications set assigned_teacher_id=p_teacher_id,updated_at=v_now where id=p_application_id;
    return;
  end if;

  v_start := case when p_operation='confirm' then v_app.requested_slot_at else v_app.confirmed_slot_at end;
  if p_operation='assign' and v_app.confirmed_schedule_block_id is not null then
    select * into v_source from public.schedule_blocks where id=v_app.confirmed_schedule_block_id;
    if not found then raise exception 'missing_requested_schedule_block'; end if;
    if v_source.class_id is not null and v_source.class_id<>v_class then raise exception 'missing_requested_schedule_block'; end if;
    if v_start is not null and v_start<>v_source.start_at then raise exception 'invalid_requested_class_schedule_occurrence'; end if;
    v_start := coalesce(v_start,v_source.start_at);
    v_end := v_source.end_at;
    v_capacity := v_source.capacity;
  elsif v_app.class_schedule_id is not null then
    select * into v_schedule from public.class_schedules where id=v_app.class_schedule_id and class_id=v_class for share;
    if not found or v_start is null then raise exception 'invalid_requested_class_schedule_occurrence'; end if;
    if (v_start at time zone 'Asia/Seoul')::time <> v_schedule.start_time
      or (v_schedule.schedule_type='one_time' and (v_start at time zone 'Asia/Seoul')::date <> v_schedule.specific_date)
      or (v_schedule.schedule_type='weekly' and extract(dow from v_start at time zone 'Asia/Seoul') <> v_schedule.day_of_week)
      then raise exception 'invalid_requested_class_schedule_occurrence'; end if;
    if p_operation='confirm' and v_schedule.booking_status <> 'open' then raise exception 'schedule_booking_closed'; end if;
    v_end := v_start + (v_schedule.end_time-v_schedule.start_time);
    v_capacity := greatest(1,coalesce(v_schedule.capacity,1));
    -- The applicant already reserves one place: exclude it from the count.
    select count(*) into v_count from public.studio_trial_applications a
      where a.id<>p_application_id and a.class_id=v_class and a.class_schedule_id=v_app.class_schedule_id
        and a.status in ('new','reviewing','confirmed')
        and coalesce(a.confirmed_slot_at,a.requested_slot_at)=v_start;
    if p_operation='confirm' and v_count>=v_capacity then raise exception 'slot_capacity_reached'; end if;
  elsif v_app.requested_schedule_block_id is not null then
    select b.* into v_source from public.schedule_blocks b
      join public.teachers t on t.id=b.teacher_id
      where b.id=v_app.requested_schedule_block_id and t.organization_id=v_org
        and (b.class_id=v_class or (b.class_id is null and exists(select 1 from public.classes c where c.id=v_class and c.teacher_id=b.teacher_id)));
    if not found or v_source.type<>'available' or v_source.start_at is distinct from v_start then
      raise exception 'missing_requested_schedule_block'; end if;
    v_end:=v_source.end_at; v_capacity:=v_source.capacity;
  else raise exception 'missing_requested_schedule_block';
  end if;
  if v_start is null or v_end is null or v_end<=v_start then raise exception 'invalid_requested_class_schedule_occurrence'; end if;

  if p_teacher_id is null then
    -- Class schedule is the reservation source; never invent a teacher-owned block.
    v_block := case when v_app.class_schedule_id is not null then null else v_source.id end;
    if v_block is null and v_app.class_schedule_id is null then raise exception 'missing_requested_schedule_block'; end if;
  else
    -- An available interval is reusable for the same class/time. Other overlaps
    -- (blocked/regular/another class's booking) must not be silently overwritten.
    if exists(select 1 from public.schedule_blocks b where b.teacher_id=p_teacher_id
      and b.start_at<v_end and b.end_at>v_start
      and not (b.type='available' and b.class_id=v_class and b.start_at=v_start and b.end_at=v_end)
      and not (b.type='trial_booked' and b.related_application_id=p_application_id)) then
      raise exception 'schedule_block_conflict_for_requested_occurrence';
    end if;
    select b.id, b.capacity into v_block,v_capacity from public.schedule_blocks b
      where b.teacher_id=p_teacher_id and b.class_id=v_class and b.start_at=v_start and b.end_at=v_end
        and (b.type='available' or (b.type='trial_booked' and b.related_application_id=p_application_id))
      order by b.id limit 1 for update;
    if v_block is null then
      -- Preserve original source capacity after SELECT INTO returns no row.
      v_capacity:=greatest(1,coalesce(v_schedule.capacity,v_source.capacity,1));
      insert into public.schedule_blocks(teacher_id,class_id,type,start_at,end_at,capacity)
        values(p_teacher_id,v_class,'available',v_start,v_end,v_capacity) returning id into v_block;
    end if;
    select count(*) into v_count from public.studio_trial_applications a where a.id<>p_application_id
      and a.status in ('new','reviewing','confirmed')
      and (a.confirmed_schedule_block_id=v_block or a.requested_schedule_block_id=v_block);
    if v_count>=v_capacity then raise exception 'slot_capacity_reached'; end if;
  end if;

  update public.studio_trial_applications set
    assigned_teacher_id=p_teacher_id,
    confirmed_schedule_block_id=v_block,
    confirmed_slot_at=v_start,
    status=case when p_operation='confirm' then 'confirmed' else v_app.status end,
    scheduled_at=case when p_operation='confirm' then v_now else scheduled_at end,
    updated_at=v_now
  where id=p_application_id;
  -- Release an exclusive imported booking after reassignment, but never delete
  -- a shared/source block referenced by any application.
  if v_app.confirmed_schedule_block_id is distinct from v_block then
    delete from public.schedule_blocks b where b.id=v_app.confirmed_schedule_block_id
      and b.type='trial_booked' and b.related_application_id=p_application_id
      and not exists(select 1 from public.studio_trial_applications a
        where a.confirmed_schedule_block_id=b.id or a.requested_schedule_block_id=b.id);
  end if;
  -- Preserve historical requested slot/block and existing logs. No reviewing event.
  insert into public.application_logs(application_id,from_status,to_status,actor_id,note)
    values(p_application_id,v_app.status,case when p_operation='confirm' then 'confirmed' else v_app.status end,v_actor,
      case when p_operation='confirm' then 'teacher가 체험 신청 일정을 확정했습니다.'
        when p_teacher_id is null then '담당 선생님을 미배정으로 변경했습니다.' else '담당 선생님을 변경했습니다.' end);
end;
$$;
revoke all on function public.set_studio_application_schedule(uuid,text,uuid,timestamptz) from public,anon;
grant execute on function public.set_studio_application_schedule(uuid,text,uuid,timestamptz) to authenticated;
