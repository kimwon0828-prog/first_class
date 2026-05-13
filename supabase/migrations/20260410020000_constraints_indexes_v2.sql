alter table profiles
  add constraint profiles_role_check
  check (role in ('parent', 'operator', 'teacher'));

alter table profiles
  add constraint profiles_role_org_check
  check (
    (role = 'parent' and organization_id is null)
    or (role in ('operator', 'teacher') and organization_id is not null)
  );

alter table teachers
  add constraint teachers_career_years_check
  check (career_years >= 0);

alter table classes
  add constraint classes_trial_price_check
  check (trial_price >= 0);

alter table schedule_blocks
  add constraint schedule_blocks_type_check
  check (type in ('regular', 'available', 'blocked', 'trial_booked'));

alter table schedule_blocks
  add constraint schedule_blocks_time_check
  check (end_at > start_at);

alter table schedule_blocks
  add constraint schedule_blocks_trial_booked_relation_check
  check (
    (type = 'trial_booked' and related_application_id is not null)
    or (type <> 'trial_booked' and related_application_id is null)
  );

alter table trial_applications
  add constraint trial_applications_status_check
  check (status in ('new', 'reviewing', 'confirmed', 'completed', 'canceled'));

alter table trial_applications
  add constraint trial_applications_confirmed_state_check
  check (
    (confirmed_slot_at is null and confirmed_schedule_block_id is null)
    or (
      confirmed_slot_at is not null
      and confirmed_schedule_block_id is not null
      and status in ('confirmed', 'completed')
    )
  );

alter table application_logs
  add constraint application_logs_to_status_check
  check (to_status in ('new', 'reviewing', 'confirmed', 'completed', 'canceled'));

alter table application_logs
  add constraint application_logs_from_status_check
  check (from_status is null or from_status in ('new', 'reviewing', 'confirmed', 'completed', 'canceled'));

create unique index schedule_blocks_related_application_trial_booked_uidx
  on schedule_blocks (related_application_id)
  where type = 'trial_booked';

create index profiles_organization_id_idx on profiles (organization_id);
create index profiles_role_idx on profiles (role);

create index teachers_organization_id_idx on teachers (organization_id);

create index classes_organization_id_idx on classes (organization_id);
create index classes_teacher_id_idx on classes (teacher_id);
create index classes_active_created_at_idx on classes (is_active, created_at desc);

create index schedule_blocks_teacher_start_at_idx on schedule_blocks (teacher_id, start_at);
create index schedule_blocks_related_application_idx on schedule_blocks (related_application_id);

create index trial_applications_parent_created_at_idx on trial_applications (parent_id, created_at desc);
create index trial_applications_class_created_at_idx on trial_applications (class_id, created_at desc);
create index trial_applications_assigned_teacher_created_at_idx on trial_applications (assigned_teacher_id, created_at desc);
create index trial_applications_status_created_at_idx on trial_applications (status, created_at desc);
create index trial_applications_confirmed_schedule_block_idx on trial_applications (confirmed_schedule_block_id);

create index application_logs_application_created_at_idx on application_logs (application_id, created_at asc);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
before update on profiles
for each row execute function set_updated_at();

create trigger set_teachers_updated_at
before update on teachers
for each row execute function set_updated_at();

create trigger set_classes_updated_at
before update on classes
for each row execute function set_updated_at();

create trigger set_schedule_blocks_updated_at
before update on schedule_blocks
for each row execute function set_updated_at();

create trigger set_trial_applications_updated_at
before update on trial_applications
for each row execute function set_updated_at();
