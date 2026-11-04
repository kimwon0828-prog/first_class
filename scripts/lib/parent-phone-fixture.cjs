// Shared isolated schema for parent phone verifiers: the minimal Supabase surface plus the real
// shipped migrations up to HARDENING. Callers apply 20261030120000 themselves (before/after checks).
const fs = require('node:fs'), path = require('node:path');
const read = name => fs.readFileSync(path.join(process.cwd(), 'supabase/migrations', name), 'utf8');
async function createParentPhoneSchema(db) {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema app; create schema storage;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
    create table auth.identities(user_id uuid references auth.users on delete cascade,provider text);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
    create table profiles(id uuid primary key references auth.users on delete cascade,role text not null,
      organization_id uuid,phone text,name text,parent_birth_date date,updated_at timestamptz default now());
    create function app.current_role() returns text language sql stable security definer set search_path='' as $$select role from public.profiles where id=auth.uid()$$;
    create function app.current_org_id() returns uuid language sql stable security definer set search_path='' as $$select organization_id from public.profiles where id=auth.uid()$$;
    create table classes(id uuid primary key,organization_id uuid,teacher_id uuid,assignment_mode text default 'post_assign',is_active boolean default true,program_type text);
    create table children(id uuid primary key,parent_id uuid references profiles);
    create table trial_applications(id uuid primary key,parent_id uuid references profiles,class_id uuid references classes,
      assigned_teacher_id uuid,child_id uuid references children,child_name text,child_grade text,parent_name text,parent_phone text,
      child_school text,child_notes text,interest_subjects text,subject_experience_yn boolean,subject_experience_duration text,current_level text,
      preferred_regular_schedule text,goal_type text,goal_note text,class_schedule_id uuid,requested_schedule_block_id uuid,
      requested_slot_at timestamptz,selected_schedule_label text,memo text,status text default 'new',
      completed_at timestamptz,canceled_at timestamptz,no_show_at timestamptz,confirmed_slot_at timestamptz,confirmed_schedule_block_id uuid,
      contacted_at timestamptz,scheduled_at timestamptz,enrolled_at timestamptz,lost_at timestamptz,next_contact_at timestamptz,last_activity_at timestamptz,
      registration_status text default 'undecided',registered_course text,unregistered_reason text,unregistered_reason_note text,
      follow_up_note text,consultation_note text,trial_feedback text,final_level text,final_schedule text,regular_schedule_preference text,
      regular_schedule_preference_note text,regular_schedule_preference_updated_at timestamptz,import_batch_id uuid);
    create table application_logs(id uuid primary key,application_id uuid,actor_id uuid not null,note text);
    create table teachers(profile_id uuid); create table academy_update_requests(requester_profile_id uuid);
    create table registration_results(recorded_by uuid); create table trial_results(created_by uuid,updated_by uuid);
    create table experience_reports(published_by uuid,withdrawn_by uuid,superseded_by uuid);
    create table experience_feedback(parent_id uuid); create table parent_decisions(parent_id uuid);
    create table parent_report_engagement(parent_id uuid); create table parent_notification_reads(parent_id uuid);
    create table storage.objects(bucket_id text,name text,owner_id text,owner uuid);
    alter table profiles enable row level security; alter table trial_applications enable row level security;
    grant usage on schema public,auth to authenticated,anon,service_role;
    grant select,insert,update on profiles to authenticated;
    grant insert on trial_applications to authenticated;
    grant select on classes,children to authenticated;
    create policy profiles_select_self on profiles for select to authenticated using(id=auth.uid());
  `);
  const profileRls = read('20260410040000_rls_policies_v2.sql');
  await db.exec(profileRls.slice(profileRls.indexOf('create policy profiles_insert_self_parent'), profileRls.indexOf('create policy teachers_select')));
  await db.exec(read('20260929090000_harden_parent_application_insert.sql'));
  await db.exec(read('20261001150000_parent_account_deletion_v1.sql'));
  await db.exec(read('20261004100000_apple_parent_phone_verification.sql'));
  await db.exec(read('20261004120000_apple_parent_phone_verification_hardening.sql'));
}
module.exports = { createParentPhoneSchema, read };
