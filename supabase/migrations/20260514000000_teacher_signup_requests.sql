-- Phase 3: Teacher Signup Requests
-- Allow public teacher signup without granting immediate operational permissions.

create table public.teacher_signup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  teacher_name text not null,
  teacher_phone text,
  organization_name text not null,
  branch_name text,
  organization_phone text,
  request_note text,
  rejection_reason text,
  approved_organization_id uuid references public.organizations(id) on delete set null,
  approved_teacher_id uuid references public.teachers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- Ensure a user can only have one active/approved request
create unique index teacher_signup_requests_user_id_pending_idx 
  on public.teacher_signup_requests (user_id) 
  where status in ('pending', 'approved');

alter table public.teacher_signup_requests enable row level security;

-- Users can read their own requests
create policy teacher_signup_requests_read_self
  on public.teacher_signup_requests
  for select
  to authenticated
  using (user_id = auth.uid());

-- Allow insert for authenticated users for their own requests
create policy teacher_signup_requests_insert_self
  on public.teacher_signup_requests
  for insert
  to authenticated
  with check (user_id = auth.uid());
