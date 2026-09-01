begin;

set transaction isolation level repeatable read;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

lock table public.trial_applications in share row exclusive mode;
lock table public.schedule_blocks in share row exclusive mode;

-- This migration intentionally contains the exact non-PII before image audited on 2026-09-01.
-- It must fail closed if the legacy signature, row identities, timestamps, block topology, or
-- updated_at values differ at apply time. The same values are the source of truth for rollback.

do $$
declare
  missing_column_count integer;
  enabled_trigger_count integer;
  matching_fk_count integer;
  referencing_fk_count integer;
begin
  select count(*)
  into missing_column_count
  from (
    values
      ('trial_applications', 'id'),
      ('trial_applications', 'requested_slot_at'),
      ('trial_applications', 'confirmed_slot_at'),
      ('trial_applications', 'requested_schedule_block_id'),
      ('trial_applications', 'confirmed_schedule_block_id'),
      ('trial_applications', 'class_schedule_id'),
      ('trial_applications', 'updated_at'),
      ('schedule_blocks', 'id'),
      ('schedule_blocks', 'teacher_id'),
      ('schedule_blocks', 'class_id'),
      ('schedule_blocks', 'type'),
      ('schedule_blocks', 'start_at'),
      ('schedule_blocks', 'end_at'),
      ('schedule_blocks', 'related_application_id'),
      ('schedule_blocks', 'capacity'),
      ('schedule_blocks', 'created_at'),
      ('schedule_blocks', 'updated_at'),
      ('class_schedules', 'id'),
      ('class_schedules', 'class_id'),
      ('class_schedules', 'schedule_type'),
      ('class_schedules', 'day_of_week'),
      ('class_schedules', 'specific_date'),
      ('class_schedules', 'start_time'),
      ('class_schedules', 'end_time')
  ) as required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns actual
    where actual.table_schema = 'public'
      and actual.table_name = required.table_name
      and actual.column_name = required.column_name
  );

  if missing_column_count <> 0 then
    raise exception 'legacy KST backfill aborted: required schema columns are missing';
  end if;

  select count(*)
  into enabled_trigger_count
  from pg_trigger
  where not tgisinternal
    and tgenabled = 'O'
    and (
      (tgrelid = 'public.trial_applications'::regclass and tgname = 'set_trial_applications_updated_at')
      or
      (tgrelid = 'public.schedule_blocks'::regclass and tgname = 'set_schedule_blocks_updated_at')
    );

  if enabled_trigger_count <> 2 then
    raise exception 'legacy KST backfill aborted: updated_at triggers are missing or not enabled';
  end if;

  select count(*)
  into matching_fk_count
  from pg_constraint
  where conrelid = 'public.trial_applications'::regclass
    and contype = 'f'
    and conname in (
      'trial_applications_requested_schedule_block_id_fkey',
      'trial_applications_confirmed_schedule_block_id_fkey'
    )
    and confrelid = 'public.schedule_blocks'::regclass
    and confupdtype = 'a'
    and confdeltype = 'n';

  if matching_fk_count <> 2 then
    raise exception 'legacy KST backfill aborted: application block FK policy differs from audited schema';
  end if;

  select count(*)
  into referencing_fk_count
  from pg_constraint
  where contype = 'f'
    and confrelid = 'public.schedule_blocks'::regclass;

  if referencing_fk_count <> 2 then
    raise exception 'legacy KST backfill aborted: unexpected table references schedule_blocks';
  end if;
end
$$;

create temporary table _expected_application_before (
  id uuid primary key,
  requested_slot_at timestamptz not null,
  confirmed_slot_at timestamptz,
  requested_schedule_block_id uuid,
  confirmed_schedule_block_id uuid,
  updated_at timestamptz not null,
  normalized_start_at timestamptz not null,
  normalized_end_at timestamptz not null,
  status text not null,
  registration_status text not null
) on commit drop;

insert into _expected_application_before (
  id,
  requested_slot_at,
  confirmed_slot_at,
  requested_schedule_block_id,
  confirmed_schedule_block_id,
  updated_at,
  normalized_start_at,
  normalized_end_at,
  status,
  registration_status
)
values
  ('0c9b4f9a-8714-4009-9a86-50048b4008c8', '2026-08-26T20:00:00+00:00', null, null, null, '2026-08-24T08:37:02.703915+00:00', '2026-08-26T11:00:00+00:00', '2026-08-26T12:00:00+00:00', 'new', 'undecided'),
  ('279cbbf6-4f7c-46ff-9d21-fb3297e0f08f', '2026-06-29T15:30:00+00:00', null, '12ce8172-7db0-4d96-ad6c-3f10a8cbb944', null, '2026-06-27T09:42:23.553108+00:00', '2026-06-29T06:30:00+00:00', '2026-06-29T07:30:00+00:00', 'canceled', 'undecided'),
  ('315022dc-8fb5-4529-97ed-6746ef04f195', '2026-07-28T16:00:00+00:00', '2026-07-28T16:00:00+00:00', '3ba6f823-6e79-41e3-91ce-1cb936996fbe', '3ba6f823-6e79-41e3-91ce-1cb936996fbe', '2026-09-01T12:38:05.236362+00:00', '2026-07-28T07:00:00+00:00', '2026-07-28T08:00:00+00:00', 'completed', 'enrolled'),
  ('39b50ee3-b423-4052-b474-71d0003cafbb', '2026-08-18T16:00:00+00:00', null, null, null, '2026-08-11T13:21:24.972868+00:00', '2026-08-18T07:00:00+00:00', '2026-08-18T08:00:00+00:00', 'canceled', 'undecided'),
  ('47312806-cec8-4a51-b17f-862d29b79ec3', '2026-07-27T15:30:00+00:00', null, null, null, '2026-07-03T08:42:25.650572+00:00', '2026-07-27T06:30:00+00:00', '2026-07-27T07:30:00+00:00', 'canceled', 'undecided'),
  ('494d3e83-7396-46d5-b766-a7840efc0a73', '2026-07-20T15:30:00+00:00', null, null, null, '2026-07-03T08:43:31.424117+00:00', '2026-07-20T06:30:00+00:00', '2026-07-20T07:30:00+00:00', 'canceled', 'undecided'),
  ('49d5bdcf-a594-4309-b6f0-7b5a5e5868fa', '2026-07-22T16:11:00+00:00', null, null, null, '2026-07-22T07:43:36.410614+00:00', '2026-07-22T07:11:00+00:00', '2026-07-22T08:11:00+00:00', 'canceled', 'undecided'),
  ('4ca14fbe-ba07-4f23-932c-4cc55fa5fc25', '2026-07-06T15:30:00+00:00', null, null, null, '2026-07-03T08:06:19.026756+00:00', '2026-07-06T06:30:00+00:00', '2026-07-06T07:30:00+00:00', 'canceled', 'undecided'),
  ('66322d92-b461-4b61-bd8c-a743e37f6563', '2026-07-13T15:30:00+00:00', '2026-07-13T15:30:00+00:00', 'f021091c-c5e3-4fd6-83cf-01515dfb5568', 'f021091c-c5e3-4fd6-83cf-01515dfb5568', '2026-07-22T10:12:26.494895+00:00', '2026-07-13T06:30:00+00:00', '2026-07-13T07:30:00+00:00', 'completed', 'enrolled'),
  ('6bc8af6a-3d2a-4e72-8bf1-5d43adbedeb9', '2026-09-03T18:00:00+00:00', null, null, null, '2026-08-24T07:51:22.078308+00:00', '2026-09-03T09:00:00+00:00', '2026-09-03T10:00:00+00:00', 'canceled', 'undecided'),
  ('7bf9fb0a-c5bc-40dc-923d-c4affe1dbd88', '2026-08-25T21:00:00+00:00', null, null, null, '2026-08-24T13:13:35.762125+00:00', '2026-08-25T12:00:00+00:00', '2026-08-25T13:00:00+00:00', 'new', 'undecided'),
  ('81f6cbd4-62f0-47f7-8496-52bccf41450c', '2026-06-29T15:30:00+00:00', '2026-06-29T15:30:00+00:00', '12ce8172-7db0-4d96-ad6c-3f10a8cbb944', '12ce8172-7db0-4d96-ad6c-3f10a8cbb944', '2026-07-23T11:33:38.850418+00:00', '2026-06-29T06:30:00+00:00', '2026-06-29T07:30:00+00:00', 'completed', 'enrolled'),
  ('8d9ef19f-100e-43bf-b740-859b1d876d41', '2026-08-11T16:00:00+00:00', null, null, null, '2026-08-11T09:13:54.964182+00:00', '2026-08-11T07:00:00+00:00', '2026-08-11T08:00:00+00:00', 'canceled', 'undecided'),
  ('accb5ced-71eb-44ce-bb86-5d39340d47f3', '2026-07-28T16:00:00+00:00', '2026-07-28T16:00:00+00:00', '3ba6f823-6e79-41e3-91ce-1cb936996fbe', '3ba6f823-6e79-41e3-91ce-1cb936996fbe', '2026-07-22T10:20:24.309788+00:00', '2026-07-28T07:00:00+00:00', '2026-07-28T08:00:00+00:00', 'confirmed', 'undecided'),
  ('aedb11c3-fccd-45fb-a026-48879c2c8747', '2026-08-13T20:00:00+00:00', null, null, null, '2026-08-11T13:20:22.838084+00:00', '2026-08-13T11:00:00+00:00', '2026-08-13T12:00:00+00:00', 'canceled', 'undecided'),
  ('b8d02de2-2d2c-4d33-b515-082fcd92fc16', '2026-09-01T21:00:00+00:00', null, null, null, '2026-09-01T13:05:47.750683+00:00', '2026-09-01T12:00:00+00:00', '2026-09-01T13:00:00+00:00', 'reviewing', 'undecided'),
  ('c25a4818-de49-4fef-ae89-8b0092a20662', '2026-08-26T19:00:00+00:00', null, null, null, '2026-08-24T13:00:41.203449+00:00', '2026-08-26T10:00:00+00:00', '2026-08-26T11:00:00+00:00', 'canceled', 'undecided'),
  ('ddc5712b-ee1a-494e-867c-6d0c064daf8d', '2026-07-20T15:30:00+00:00', null, null, null, '2026-07-03T08:06:12.914483+00:00', '2026-07-20T06:30:00+00:00', '2026-07-20T07:30:00+00:00', 'canceled', 'undecided'),
  ('e24b76ae-fe95-4b29-b44d-77bc0cffe1af', '2026-07-20T15:30:00+00:00', null, null, null, '2026-07-03T08:48:44.071082+00:00', '2026-07-20T06:30:00+00:00', '2026-07-20T07:30:00+00:00', 'canceled', 'undecided');

create temporary table _expected_block_before (
  id uuid primary key,
  replacement_block_id uuid,
  teacher_id uuid not null,
  class_id uuid not null,
  type text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  normalized_start_at timestamptz not null,
  normalized_end_at timestamptz not null,
  related_application_id uuid,
  capacity integer not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
) on commit drop;

insert into _expected_block_before (
  id,
  replacement_block_id,
  teacher_id,
  class_id,
  type,
  start_at,
  end_at,
  normalized_start_at,
  normalized_end_at,
  related_application_id,
  capacity,
  created_at,
  updated_at
)
values
  ('12ce8172-7db0-4d96-ad6c-3f10a8cbb944', '8dd628cf-9cc9-4629-a26f-6fdee3bf8a72', '955b8c51-deda-4502-864c-6b275bc01f8b', '6bddae75-f908-40ac-9c16-f78f50986da6', 'available', '2026-06-29T15:30:00+00:00', '2026-06-29T16:30:00+00:00', '2026-06-29T06:30:00+00:00', '2026-06-29T07:30:00+00:00', null, 3, '2026-06-26T08:32:58.577974+00:00', '2026-06-26T08:32:58.483+00:00'),
  ('3ba6f823-6e79-41e3-91ce-1cb936996fbe', null, '955b8c51-deda-4502-864c-6b275bc01f8b', '5b527274-ef06-4772-b0f6-7aad7786520d', 'available', '2026-07-28T16:00:00+00:00', '2026-07-28T17:00:00+00:00', '2026-07-28T07:00:00+00:00', '2026-07-28T08:00:00+00:00', null, 3, '2026-07-22T07:42:40.549246+00:00', '2026-07-22T07:42:40.362+00:00'),
  ('f021091c-c5e3-4fd6-83cf-01515dfb5568', null, '955b8c51-deda-4502-864c-6b275bc01f8b', '6bddae75-f908-40ac-9c16-f78f50986da6', 'available', '2026-07-13T15:30:00+00:00', '2026-07-13T16:30:00+00:00', '2026-07-13T06:30:00+00:00', '2026-07-13T07:30:00+00:00', null, 3, '2026-07-03T11:24:45.971391+00:00', '2026-07-03T11:24:45.862+00:00');

create temporary view _legacy_kst_application_signature as
select
  application.id,
  application.requested_slot_at,
  application.confirmed_slot_at,
  application.requested_schedule_block_id,
  application.confirmed_schedule_block_id,
  application.updated_at,
  normalized.normalized_start_at,
  normalized.normalized_start_at + normalized.duration_minutes * interval '1 minute' as normalized_end_at,
  application.status,
  application.registration_status
from public.trial_applications application
join public.class_schedules class_schedule
  on class_schedule.id = application.class_schedule_id
 and class_schedule.class_id = application.class_id
cross join lateral (
  select
    ((application.requested_slot_at at time zone 'UTC') at time zone 'Asia/Seoul') as normalized_start_at,
    (
      extract(hour from class_schedule.end_time)::integer * 60
      + extract(minute from class_schedule.end_time)::integer
      - extract(hour from class_schedule.start_time)::integer * 60
      - extract(minute from class_schedule.start_time)::integer
    ) as duration_minutes
) normalized
where date_trunc('minute', application.requested_slot_at) = application.requested_slot_at
  and normalized.duration_minutes > 0
  and extract(hour from application.requested_slot_at at time zone 'UTC') = extract(hour from class_schedule.start_time)
  and extract(minute from application.requested_slot_at at time zone 'UTC') = extract(minute from class_schedule.start_time)
  and not (
    extract(hour from application.requested_slot_at at time zone 'Asia/Seoul') = extract(hour from class_schedule.start_time)
    and extract(minute from application.requested_slot_at at time zone 'Asia/Seoul') = extract(minute from class_schedule.start_time)
  )
  and (
    (
      class_schedule.schedule_type = 'one_time'
      and class_schedule.specific_date = (application.requested_slot_at at time zone 'UTC')::date
    )
    or
    (
      class_schedule.schedule_type = 'weekly'
      and class_schedule.day_of_week = extract(dow from application.requested_slot_at at time zone 'UTC')::integer
    )
  )
  and application.requested_slot_at - normalized.normalized_start_at = interval '9 hours';

create temporary table _application_before on commit drop as
select
  signature.*,
  to_jsonb(application) - array[
    'requested_slot_at',
    'confirmed_slot_at',
    'requested_schedule_block_id',
    'confirmed_schedule_block_id',
    'updated_at'
  ] as protected_row
from _legacy_kst_application_signature signature
join public.trial_applications application on application.id = signature.id;

create temporary table _history_before (
  relation_name text primary key,
  row_count bigint not null,
  content_hash text not null
) on commit drop;

insert into _history_before (relation_name, row_count, content_hash)
select
  'sms_logs',
  count(*),
  md5(coalesce(string_agg(to_jsonb(log_row)::text, E'\n' order by log_row.id::text), ''))
from public.sms_logs log_row
where log_row.trial_application_id in (select id from _expected_application_before)
union all
select
  'application_logs',
  count(*),
  md5(coalesce(string_agg(to_jsonb(log_row)::text, E'\n' order by log_row.id::text), ''))
from public.application_logs log_row
where log_row.application_id in (select id from _expected_application_before);

create temporary table _replacement_block_before on commit drop as
select to_jsonb(block_row) as row_data
from public.schedule_blocks block_row
where block_row.id = '8dd628cf-9cc9-4629-a26f-6fdee3bf8a72';

do $$
declare
  affected_count integer;
  confirmed_count integer;
  null_confirmed_count integer;
  referenced_application_count integer;
  reference_field_count integer;
begin
  select count(*) into affected_count from _application_before;
  if affected_count <> 19 then
    raise exception 'legacy KST backfill aborted: expected 19 affected applications, found %', affected_count;
  end if;

  if exists (
    (
      select id, requested_slot_at, confirmed_slot_at, requested_schedule_block_id,
        confirmed_schedule_block_id, updated_at, normalized_start_at, normalized_end_at,
        status, registration_status
      from _application_before
      except
      select id, requested_slot_at, confirmed_slot_at, requested_schedule_block_id,
        confirmed_schedule_block_id, updated_at, normalized_start_at, normalized_end_at,
        status, registration_status
      from _expected_application_before
    )
    union all
    (
      select id, requested_slot_at, confirmed_slot_at, requested_schedule_block_id,
        confirmed_schedule_block_id, updated_at, normalized_start_at, normalized_end_at,
        status, registration_status
      from _expected_application_before
      except
      select id, requested_slot_at, confirmed_slot_at, requested_schedule_block_id,
        confirmed_schedule_block_id, updated_at, normalized_start_at, normalized_end_at,
        status, registration_status
      from _application_before
    )
  ) then
    raise exception 'legacy KST backfill aborted: application before image differs from audit';
  end if;

  if (select count(*) from _application_before where status = 'new') <> 2
    or (select count(*) from _application_before where status = 'reviewing') <> 1
    or (select count(*) from _application_before where status = 'confirmed') <> 1
    or (select count(*) from _application_before where status = 'completed') <> 3
    or (select count(*) from _application_before where status = 'canceled') <> 12 then
    raise exception 'legacy KST backfill aborted: status distribution differs from audit';
  end if;

  if (select count(*) from _application_before where registration_status = 'enrolled') <> 3
    or (select count(*) from _application_before where registration_status = 'undecided') <> 16
    or (select count(*) from _application_before where registration_status not in ('enrolled', 'undecided')) <> 0 then
    raise exception 'legacy KST backfill aborted: registration status distribution differs from audit';
  end if;

  select count(*) filter (where confirmed_slot_at is not null),
    count(*) filter (where confirmed_slot_at is null)
  into confirmed_count, null_confirmed_count
  from _application_before;

  if confirmed_count <> 4 or null_confirmed_count <> 15 then
    raise exception 'legacy KST backfill aborted: confirmed_slot_at distribution differs from audit';
  end if;

  if exists (
    (
      select id, teacher_id, class_id, type, start_at, end_at, related_application_id,
        capacity, created_at, updated_at
      from public.schedule_blocks
      where id in (select id from _expected_block_before)
      except
      select id, teacher_id, class_id, type, start_at, end_at, related_application_id,
        capacity, created_at, updated_at
      from _expected_block_before
    )
    union all
    (
      select id, teacher_id, class_id, type, start_at, end_at, related_application_id,
        capacity, created_at, updated_at
      from _expected_block_before
      except
      select id, teacher_id, class_id, type, start_at, end_at, related_application_id,
        capacity, created_at, updated_at
      from public.schedule_blocks
      where id in (select id from _expected_block_before)
    )
  ) then
    raise exception 'legacy KST backfill aborted: legacy schedule block before image differs from audit';
  end if;

  if (select count(*) from _replacement_block_before) <> 1
    or not exists (
      select 1
      from public.schedule_blocks replacement
      join _expected_block_before legacy
        on legacy.replacement_block_id = replacement.id
       and replacement.teacher_id = legacy.teacher_id
       and replacement.class_id = legacy.class_id
       and replacement.type = 'available'
       and replacement.start_at = legacy.normalized_start_at
       and replacement.end_at = legacy.normalized_end_at
       and replacement.capacity = legacy.capacity
       and replacement.related_application_id is null
    ) then
    raise exception 'legacy KST backfill aborted: canonical replacement block differs from audit';
  end if;

  if exists (
    select 1
    from _expected_block_before legacy
    join public.schedule_blocks collision
      on collision.teacher_id = legacy.teacher_id
     and collision.class_id = legacy.class_id
     and collision.start_at = legacy.normalized_start_at
     and collision.end_at = legacy.normalized_end_at
     and collision.id <> legacy.id
    where legacy.replacement_block_id is null
  ) then
    raise exception 'legacy KST backfill aborted: unexpected block exists at a direct-normalize destination';
  end if;

  select count(distinct application.id),
    coalesce(sum(
      coalesce((application.requested_schedule_block_id in (select id from _expected_block_before))::integer, 0)
      + coalesce((application.confirmed_schedule_block_id in (select id from _expected_block_before))::integer, 0)
    ), 0)
  into referenced_application_count, reference_field_count
  from public.trial_applications application
  where application.requested_schedule_block_id in (select id from _expected_block_before)
     or application.confirmed_schedule_block_id in (select id from _expected_block_before);

  if referenced_application_count <> 5 or reference_field_count <> 9 then
    raise exception 'legacy KST backfill aborted: expected 5 block-referencing applications and 9 FK fields, found % and %',
      referenced_application_count, reference_field_count;
  end if;

  if exists (
    select 1
    from public.trial_applications application
    where (
      application.requested_schedule_block_id in (select id from _expected_block_before)
      or application.confirmed_schedule_block_id in (select id from _expected_block_before)
    )
      and application.id not in (select id from _expected_application_before)
  ) then
    raise exception 'legacy KST backfill aborted: an unaudited application references a legacy block';
  end if;
end
$$;

alter table public.trial_applications disable trigger set_trial_applications_updated_at;
alter table public.schedule_blocks disable trigger set_schedule_blocks_updated_at;

do $$
declare
  changed_count integer;
begin
  update public.trial_applications application
  set requested_schedule_block_id = case
        when application.requested_schedule_block_id = legacy.id then legacy.replacement_block_id
        else application.requested_schedule_block_id
      end,
      confirmed_schedule_block_id = case
        when application.confirmed_schedule_block_id = legacy.id then legacy.replacement_block_id
        else application.confirmed_schedule_block_id
      end
  from _expected_block_before legacy
  where legacy.replacement_block_id is not null
    and application.id in (select id from _expected_application_before)
    and (
      application.requested_schedule_block_id = legacy.id
      or application.confirmed_schedule_block_id = legacy.id
    );

  get diagnostics changed_count = row_count;
  if changed_count <> 2 then
    raise exception 'legacy KST backfill aborted: expected to reconnect 2 applications, reconnected %', changed_count;
  end if;

  if exists (
    select 1
    from public.trial_applications application
    join _expected_block_before legacy on legacy.replacement_block_id is not null
    where application.requested_schedule_block_id = legacy.id
       or application.confirmed_schedule_block_id = legacy.id
  ) then
    raise exception 'legacy KST backfill aborted: legacy merge block still has application references';
  end if;

  delete from public.schedule_blocks block_row
  using _expected_block_before legacy
  where legacy.replacement_block_id is not null
    and block_row.id = legacy.id;

  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'legacy KST backfill aborted: expected to delete 1 merged legacy block, deleted %', changed_count;
  end if;

  update public.schedule_blocks block_row
  set start_at = legacy.normalized_start_at,
      end_at = legacy.normalized_end_at,
      updated_at = legacy.updated_at
  from _expected_block_before legacy
  where legacy.replacement_block_id is null
    and block_row.id = legacy.id;

  get diagnostics changed_count = row_count;
  if changed_count <> 2 then
    raise exception 'legacy KST backfill aborted: expected to normalize 2 schedule blocks, normalized %', changed_count;
  end if;

  update public.trial_applications application
  set requested_slot_at = before_image.normalized_start_at,
      confirmed_slot_at = case
        when before_image.confirmed_slot_at is null then null
        else before_image.normalized_start_at
      end,
      updated_at = before_image.updated_at
  from _application_before before_image
  where application.id = before_image.id;

  get diagnostics changed_count = row_count;
  if changed_count <> 19 then
    raise exception 'legacy KST backfill aborted: expected to normalize 19 applications, normalized %', changed_count;
  end if;
end
$$;

alter table public.schedule_blocks enable trigger set_schedule_blocks_updated_at;
alter table public.trial_applications enable trigger set_trial_applications_updated_at;

do $$
declare
  affected_count integer;
  referenced_application_count integer;
  reference_field_count integer;
  current_history record;
  expected_history record;
begin
  select count(*) into affected_count from _legacy_kst_application_signature;
  if affected_count <> 0 then
    raise exception 'legacy KST backfill post-check failed: % legacy signatures remain', affected_count;
  end if;

  if (select count(*) from public.trial_applications where id in (select id from _expected_application_before)) <> 19 then
    raise exception 'legacy KST backfill post-check failed: affected application rows are missing';
  end if;

  if exists (
    select 1
    from _application_before before_image
    join public.trial_applications application on application.id = before_image.id
    where to_jsonb(application) - array[
      'requested_slot_at',
      'confirmed_slot_at',
      'requested_schedule_block_id',
      'confirmed_schedule_block_id',
      'updated_at'
    ] <> before_image.protected_row
  ) then
    raise exception 'legacy KST backfill post-check failed: protected application data changed';
  end if;

  if exists (
    select 1
    from _expected_application_before expected
    join public.trial_applications application on application.id = expected.id
    where application.requested_slot_at <> expected.normalized_start_at
      or application.confirmed_slot_at is distinct from case
        when expected.confirmed_slot_at is null then null
        else expected.normalized_start_at
      end
      or application.updated_at <> expected.updated_at
      or application.status <> expected.status
      or application.registration_status <> expected.registration_status
  ) then
    raise exception 'legacy KST backfill post-check failed: application values differ from plan';
  end if;

  if (select count(*) from public.trial_applications application join _expected_application_before expected on expected.id = application.id where application.status = 'new') <> 2
    or (select count(*) from public.trial_applications application join _expected_application_before expected on expected.id = application.id where application.status = 'reviewing') <> 1
    or (select count(*) from public.trial_applications application join _expected_application_before expected on expected.id = application.id where application.status = 'confirmed') <> 1
    or (select count(*) from public.trial_applications application join _expected_application_before expected on expected.id = application.id where application.status = 'completed') <> 3
    or (select count(*) from public.trial_applications application join _expected_application_before expected on expected.id = application.id where application.status = 'canceled') <> 12 then
    raise exception 'legacy KST backfill post-check failed: status distribution changed';
  end if;

  if (select count(*) from public.trial_applications application join _expected_application_before expected on expected.id = application.id where application.registration_status = 'enrolled') <> 3
    or (select count(*) from public.trial_applications application join _expected_application_before expected on expected.id = application.id where application.registration_status = 'undecided') <> 16
    or (select count(*) from public.trial_applications application join _expected_application_before expected on expected.id = application.id where application.registration_status not in ('enrolled', 'undecided')) <> 0 then
    raise exception 'legacy KST backfill post-check failed: registration status distribution changed';
  end if;

  if (select count(*) from public.trial_applications application join _expected_application_before expected on expected.id = application.id where application.confirmed_slot_at is not null) <> 4
    or (select count(*) from public.trial_applications application join _expected_application_before expected on expected.id = application.id where application.confirmed_slot_at is null) <> 15 then
    raise exception 'legacy KST backfill post-check failed: confirmed_slot_at nullability changed';
  end if;

  if exists (
    select 1
    from _expected_block_before legacy
    left join public.schedule_blocks block_row on block_row.id = legacy.id
    where (
      legacy.replacement_block_id is not null
      and block_row.id is not null
    )
    or (
      legacy.replacement_block_id is null
      and (
        block_row.id is null
        or block_row.start_at <> legacy.normalized_start_at
        or block_row.end_at <> legacy.normalized_end_at
        or block_row.updated_at <> legacy.updated_at
        or block_row.teacher_id <> legacy.teacher_id
        or block_row.class_id <> legacy.class_id
        or block_row.type <> legacy.type
        or block_row.related_application_id is distinct from legacy.related_application_id
        or block_row.capacity <> legacy.capacity
        or block_row.created_at <> legacy.created_at
      )
    )
  ) then
    raise exception 'legacy KST backfill post-check failed: schedule block normalization differs from plan';
  end if;

  if (select to_jsonb(block_row) from public.schedule_blocks block_row where block_row.id = '8dd628cf-9cc9-4629-a26f-6fdee3bf8a72')
    is distinct from (select row_data from _replacement_block_before) then
    raise exception 'legacy KST backfill post-check failed: canonical replacement block changed';
  end if;

  if exists (
    select 1
    from _expected_application_before expected
    join public.trial_applications application on application.id = expected.id
    left join public.schedule_blocks requested_block on requested_block.id = application.requested_schedule_block_id
    where expected.requested_schedule_block_id is not null
      and (
        application.requested_schedule_block_id is null
        or requested_block.start_at <> expected.normalized_start_at
        or requested_block.end_at <> expected.normalized_end_at
      )
  ) then
    raise exception 'legacy KST backfill post-check failed: a requested block FK is not normalized';
  end if;

  if exists (
    select 1
    from _expected_application_before expected
    join public.trial_applications application on application.id = expected.id
    left join public.schedule_blocks confirmed_block on confirmed_block.id = application.confirmed_schedule_block_id
    where expected.confirmed_schedule_block_id is not null
      and (
        application.confirmed_schedule_block_id is null
        or confirmed_block.start_at <> expected.normalized_start_at
        or confirmed_block.end_at <> expected.normalized_end_at
      )
  ) then
    raise exception 'legacy KST backfill post-check failed: a confirmed block FK is not normalized';
  end if;

  select count(distinct application.id),
    coalesce(sum(
      (application.requested_schedule_block_id is not null and expected.requested_schedule_block_id is not null)::integer
      + (application.confirmed_schedule_block_id is not null and expected.confirmed_schedule_block_id is not null)::integer
    ), 0)
  into referenced_application_count, reference_field_count
  from _expected_application_before expected
  join public.trial_applications application on application.id = expected.id
  where expected.requested_schedule_block_id is not null
     or expected.confirmed_schedule_block_id is not null;

  if referenced_application_count <> 5 or reference_field_count <> 9 then
    raise exception 'legacy KST backfill post-check failed: expected 5 block-referencing applications and 9 FK fields, found % and %',
      referenced_application_count, reference_field_count;
  end if;

  for expected_history in select * from _history_before loop
    if expected_history.relation_name = 'sms_logs' then
      select
        count(*) as row_count,
        md5(coalesce(string_agg(to_jsonb(log_row)::text, E'\n' order by log_row.id::text), '')) as content_hash
      into current_history
      from public.sms_logs log_row
      where log_row.trial_application_id in (select id from _expected_application_before);
    else
      select
        count(*) as row_count,
        md5(coalesce(string_agg(to_jsonb(log_row)::text, E'\n' order by log_row.id::text), '')) as content_hash
      into current_history
      from public.application_logs log_row
      where log_row.application_id in (select id from _expected_application_before);
    end if;

    if current_history.row_count <> expected_history.row_count
      or current_history.content_hash <> expected_history.content_hash then
      raise exception 'legacy KST backfill post-check failed: % history changed', expected_history.relation_name;
    end if;
  end loop;

  if (
    select count(*)
    from pg_trigger
    where not tgisinternal
      and tgenabled = 'O'
      and (
        (tgrelid = 'public.trial_applications'::regclass and tgname = 'set_trial_applications_updated_at')
        or
        (tgrelid = 'public.schedule_blocks'::regclass and tgname = 'set_schedule_blocks_updated_at')
      )
  ) <> 2 then
    raise exception 'legacy KST backfill post-check failed: updated_at triggers were not restored';
  end if;
end
$$;

-- Rollback source of truth (manual; intentionally not executed here):
--
-- 1. Start one transaction and assert that the 19 application IDs still contain the normalized
--    values above. If business mutations occurred after this migration, reconcile those rows
--    before rollback rather than overwriting newer activity.
-- 2. Disable only set_trial_applications_updated_at and set_schedule_blocks_updated_at.
-- 3. Reinsert block 12ce8172-7db0-4d96-ad6c-3f10a8cbb944 using its exact row in
--    _expected_block_before above, including id, timestamps, capacity, and created/updated_at.
-- 4. Restore the other two block rows to their start_at/end_at/updated_at values above.
-- 5. Restore each application from _expected_application_before above: requested_slot_at,
--    confirmed_slot_at, both block FKs, and updated_at. The two applications originally pointing
--    at block 12ce8172-7db0-4d96-ad6c-3f10a8cbb944 thereby reconnect to that restored block.
-- 6. Re-enable both updated_at triggers, verify the original 19-row signature and 3 legacy blocks,
--    then commit. Any assertion failure must roll the whole rollback transaction back.

commit;
