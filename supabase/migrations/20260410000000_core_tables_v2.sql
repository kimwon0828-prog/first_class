create extension if not exists pgcrypto;

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branch_name text,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null,
  name text not null,
  phone text,
  organization_id uuid references organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table teachers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete restrict,
  intro text,
  specialty text,
  career_years integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  teacher_id uuid references teachers(id) on delete set null,
  title text not null,
  subject text not null,
  target_age text not null,
  region text not null,
  description text not null,
  trial_price integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table trial_applications (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references profiles(id) on delete restrict,
  class_id uuid not null references classes(id) on delete restrict,
  assigned_teacher_id uuid references teachers(id) on delete set null,
  child_name text not null,
  child_grade text not null,
  requested_slot_at timestamptz not null,
  confirmed_slot_at timestamptz,
  confirmed_schedule_block_id uuid,
  memo text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  type text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  related_application_id uuid references trial_applications(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table trial_applications
  add constraint trial_applications_confirmed_schedule_block_id_fkey
  foreign key (confirmed_schedule_block_id)
  references schedule_blocks(id)
  on delete set null;

create table application_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references trial_applications(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid not null references profiles(id) on delete restrict,
  note text,
  created_at timestamptz not null default now()
);
