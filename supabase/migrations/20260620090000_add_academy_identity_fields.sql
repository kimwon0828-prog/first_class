do $$
begin
  alter table public.teacher_signup_requests
    add column if not exists representative_name text,
    add column if not exists business_registration_number text,
    add column if not exists business_registration_file_path text,
    add column if not exists academy_phone text,
    add column if not exists contact_phone text,
    add column if not exists postal_code text,
    add column if not exists address_line1 text,
    add column if not exists address_line2 text,
    add column if not exists admin_note text,
    add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
    add column if not exists reviewed_at timestamptz;
end
$$;

do $$
begin
  alter table public.organizations
    add column if not exists representative_name text,
    add column if not exists business_registration_number text,
    add column if not exists business_registration_file_path text,
    add column if not exists academy_phone text,
    add column if not exists contact_phone text,
    add column if not exists postal_code text,
    add column if not exists address_line1 text,
    add column if not exists address_line2 text,
    add column if not exists updated_at timestamptz;
end
$$;

update public.organizations
set updated_at = now()
where updated_at is null;

alter table public.organizations
  alter column updated_at set default now();

alter table public.organizations
  alter column updated_at set not null;

do $$
begin
  alter table public.teachers
    add column if not exists phone text,
    add column if not exists sms_enabled boolean not null default false;
end
$$;

update public.teachers
set sms_enabled = false
where sms_enabled is null;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.organizations'::regclass
      and tgname = 'set_organizations_updated_at'
      and not tgisinternal
  ) then
    create trigger set_organizations_updated_at
    before update on public.organizations
    for each row execute function public.set_updated_at();
  end if;
end
$$;
