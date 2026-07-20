do $$
begin
  alter table public.organizations
    add column if not exists latitude double precision,
    add column if not exists longitude double precision,
    add column if not exists map_updated_at timestamp with time zone;
end
$$;

alter table public.organizations
  drop constraint if exists organizations_latitude_range_check;

alter table public.organizations
  add constraint organizations_latitude_range_check
  check (latitude is null or (latitude >= -90 and latitude <= 90));

alter table public.organizations
  drop constraint if exists organizations_longitude_range_check;

alter table public.organizations
  add constraint organizations_longitude_range_check
  check (longitude is null or (longitude >= -180 and longitude <= 180));
