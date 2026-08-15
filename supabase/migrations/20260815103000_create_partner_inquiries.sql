create table if not exists public.partner_inquiries (
  id uuid primary key default gen_random_uuid(),
  academy_name text not null,
  phone text not null,
  privacy_agreed boolean not null default false,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  constraint partner_inquiries_status_check
    check (status in ('new', 'contacted', 'consulting', 'converted', 'closed'))
);

create index if not exists partner_inquiries_created_at_idx
  on public.partner_inquiries (created_at desc);

create index if not exists partner_inquiries_academy_phone_created_at_idx
  on public.partner_inquiries (academy_name, phone, created_at desc);

alter table public.partner_inquiries enable row level security;

revoke all on table public.partner_inquiries from anon;
revoke all on table public.partner_inquiries from authenticated;
