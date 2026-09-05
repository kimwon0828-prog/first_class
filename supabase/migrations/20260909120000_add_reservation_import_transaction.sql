-- 선택한 예약 행들을 하나의 transaction 으로 가져온다.
--
-- 왜 SECURITY DEFINER 인가.
--   trial_applications 에는 teacher INSERT 정책이 없다. 학원 계정으로 직접 넣으면
--   42501(row-level security policy) 로 거절된다 — 실제로 확인했다.
--   학부모 신청 정책(parent_insert_self)은 parent_id = auth.uid() 를 요구하므로
--   학부모 계정이 없는 이관 예약을 표현할 수 없다.
--   정책을 넓히면 Marketplace 신청 경계까지 약해지므로, 이 함수 하나만 권한을 갖는다.
--
-- 대신 함수 안에서 직접 확인한다.
--   - auth.uid() 존재
--   - 호출자 profile 이 academy | admin 이고 organization 이 있음
--   - batch 가 그 조직 소유
--   - 모든 class 가 그 조직 소유
--   - 모든 teacher 가 그 조직 소유이며 활성
--   조직 id 를 파라미터로 받지 않는다 — 호출자가 주장하는 조직을 믿지 않는다.
--
-- 멱등성: 이미 completed 인 batch 는 아무것도 쓰지 않고 기존 결과를 돌려준다.
-- 브라우저 응답이 유실돼 다시 눌러도 신청이 두 벌 생기지 않는다.
--
-- SMS 는 이 경로에 없다. 과거 예약을 옮겼다고 학부모에게 안내가 나가면 안 된다.

create or replace function public.import_studio_trial_reservations(
  p_batch_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_org uuid;
  v_role text;
  v_batch public.studio_import_batches%rowtype;
  v_row jsonb;
  v_application_id uuid;
  v_block_id uuid;
  v_class_org uuid;
  v_teacher_org uuid;
  v_teacher_active boolean;
  v_status text;
  v_imported integer := 0;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  select p.organization_id, p.role
  into v_org, v_role
  from public.profiles p
  where p.id = v_actor;

  -- role 매핑은 normalizeProfileRole 과 같다: academy | admin 이 Studio 계정이다.
  if v_org is null or v_role is null or v_role not in ('academy', 'admin') then
    raise exception 'import_batch_not_found_or_forbidden';
  end if;

  select *
  into v_batch
  from public.studio_import_batches
  where id = p_batch_id
    and organization_id = v_org
  for update;

  if not found then
    raise exception 'import_batch_not_found_or_forbidden';
  end if;

  -- 이미 끝난 batch 는 다시 쓰지 않는다(재클릭/응답 유실 대비).
  if v_batch.status = 'completed' then
    return jsonb_build_object(
      'mode', 'duplicate',
      'batchId', v_batch.id,
      'importedRows', v_batch.imported_rows
    );
  end if;

  if v_batch.status = 'importing' then
    raise exception 'import_batch_in_progress';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'import_rows_empty';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_status := v_row ->> 'status';
    if v_status not in ('new', 'reviewing', 'confirmed') then
      raise exception 'import_status_not_allowed';
    end if;

    -- 수업이 이 조직 소유인지 다시 확인한다. client 가 보낸 id 를 믿지 않는다.
    select c.organization_id into v_class_org
    from public.classes c
    where c.id = (v_row ->> 'classId')::uuid;

    if v_class_org is null or v_class_org <> v_org then
      raise exception 'import_class_not_in_organization';
    end if;

    insert into public.trial_applications (
      parent_id,
      class_id,
      child_name,
      child_grade,
      child_school,
      parent_name,
      parent_phone,
      memo,
      requested_slot_at,
      status,
      import_batch_id
    )
    values (
      null,
      (v_row ->> 'classId')::uuid,
      v_row ->> 'childName',
      v_row ->> 'childGrade',
      nullif(v_row ->> 'childSchool', ''),
      nullif(v_row ->> 'parentName', ''),
      nullif(v_row ->> 'parentPhone', ''),
      nullif(v_row ->> 'memo', ''),
      (v_row ->> 'requestedSlotAt')::timestamptz,
      v_status,
      p_batch_id
    )
    returning id into v_application_id;

    if v_status = 'confirmed' then
      select t.organization_id, t.is_active
      into v_teacher_org, v_teacher_active
      from public.teachers t
      where t.id = (v_row ->> 'teacherId')::uuid;

      if v_teacher_org is null or v_teacher_org <> v_org then
        raise exception 'import_teacher_not_in_organization';
      end if;

      if not v_teacher_active then
        raise exception 'import_teacher_inactive';
      end if;

      -- 확정 예약은 자기 전용 예약 블록을 만든다.
      -- 기존 available 블록에 자동으로 붙이지 않는다(정원·마감에 영향).
      insert into public.schedule_blocks (
        teacher_id,
        class_id,
        type,
        start_at,
        end_at,
        related_application_id
      )
      values (
        (v_row ->> 'teacherId')::uuid,
        (v_row ->> 'classId')::uuid,
        'trial_booked',
        (v_row ->> 'confirmedStartAt')::timestamptz,
        (v_row ->> 'confirmedEndAt')::timestamptz,
        v_application_id
      )
      returning id into v_block_id;

      -- confirmed_slot_at 과 confirmed_schedule_block_id 는 CHECK 상 함께 채워야 한다.
      update public.trial_applications
      set confirmed_slot_at = (v_row ->> 'confirmedStartAt')::timestamptz,
          confirmed_schedule_block_id = v_block_id,
          assigned_teacher_id = (v_row ->> 'teacherId')::uuid
      where id = v_application_id;
    end if;

    insert into public.application_logs (application_id, from_status, to_status, actor_id, note)
    values (v_application_id, null, v_status, v_actor, 'Excel 예약 가져오기');

    insert into public.studio_import_rows (
      batch_id,
      row_number,
      fingerprint,
      status,
      application_id
    )
    values (
      p_batch_id,
      (v_row ->> 'rowNumber')::integer,
      v_row ->> 'fingerprint',
      'imported',
      v_application_id
    );

    v_imported := v_imported + 1;
  end loop;

  update public.studio_import_batches
  set status = 'completed',
      imported_rows = v_imported,
      completed_at = now()
  where id = p_batch_id;

  return jsonb_build_object(
    'mode', 'created',
    'batchId', p_batch_id,
    'importedRows', v_imported
  );
end;
$$;

revoke all on function public.import_studio_trial_reservations(uuid, jsonb) from public;
grant execute on function public.import_studio_trial_reservations(uuid, jsonb) to authenticated;

-- preview 단계에서 batch 를 만드는 것도 같은 이유로 함수만 할 수 있다.
create or replace function public.create_studio_import_batch(
  p_import_type text,
  p_original_file_name text,
  p_total_rows integer,
  p_valid_rows integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_org uuid;
  v_role text;
  v_batch_id uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  select p.organization_id, p.role
  into v_org, v_role
  from public.profiles p
  where p.id = v_actor;

  if v_org is null or v_role is null or v_role not in ('academy', 'admin') then
    raise exception 'import_batch_not_found_or_forbidden';
  end if;

  insert into public.studio_import_batches (
    organization_id,
    import_type,
    original_file_name,
    status,
    total_rows,
    valid_rows,
    created_by
  )
  values (
    v_org,
    p_import_type,
    nullif(btrim(coalesce(p_original_file_name, '')), ''),
    'previewed',
    greatest(coalesce(p_total_rows, 0), 0),
    greatest(coalesce(p_valid_rows, 0), 0),
    v_actor
  )
  returning id into v_batch_id;

  return v_batch_id;
end;
$$;

revoke all on function public.create_studio_import_batch(text, text, integer, integer) from public;
grant execute on function public.create_studio_import_batch(text, text, integer, integer) to authenticated;
