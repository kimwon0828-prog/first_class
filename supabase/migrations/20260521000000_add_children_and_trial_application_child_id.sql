create table public.children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  grade text not null,
  school_name text,
  notes text,
  current_level text,
  interest_subjects text,
  goal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index children_parent_created_at_idx
  on public.children (parent_id, created_at desc);

alter table public.trial_applications
  add column if not exists child_id uuid references public.children(id) on delete set null;

create index if not exists trial_applications_child_id_idx
  on public.trial_applications (child_id);

create trigger set_children_updated_at
before update on public.children
for each row execute function public.set_updated_at();

alter table public.children enable row level security;

create policy children_parent_select_self
on public.children
for select
to authenticated
using (
  app.current_role() = 'parent'
  and parent_id = auth.uid()
);

create policy children_parent_insert_self
on public.children
for insert
to authenticated
with check (
  app.current_role() = 'parent'
  and parent_id = auth.uid()
);

create policy children_parent_update_self
on public.children
for update
to authenticated
using (
  app.current_role() = 'parent'
  and parent_id = auth.uid()
)
with check (
  app.current_role() = 'parent'
  and parent_id = auth.uid()
);
