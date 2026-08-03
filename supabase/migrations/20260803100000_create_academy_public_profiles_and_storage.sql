create table if not exists public.academy_public_profiles (
  organization_id uuid primary key
    references public.organizations(id)
    on delete cascade,
  logo_image_path text,
  cover_image_path text,
  short_description text,
  description text,
  operating_hours text,
  parking_info text,
  directions text,
  updated_by uuid
    references public.profiles(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_public_profiles_short_description_check
    check (
      short_description is null
      or (
        char_length(btrim(short_description)) between 1 and 80
        and short_description = btrim(short_description)
      )
    ),
  constraint academy_public_profiles_description_check
    check (
      description is null
      or (
        char_length(btrim(description)) between 1 and 1000
        and description = btrim(description)
      )
    ),
  constraint academy_public_profiles_operating_hours_check
    check (
      operating_hours is null
      or (
        char_length(btrim(operating_hours)) between 1 and 500
        and operating_hours = btrim(operating_hours)
      )
    ),
  constraint academy_public_profiles_parking_info_check
    check (
      parking_info is null
      or (
        char_length(btrim(parking_info)) between 1 and 500
        and parking_info = btrim(parking_info)
      )
    ),
  constraint academy_public_profiles_directions_check
    check (
      directions is null
      or (
        char_length(btrim(directions)) between 1 and 500
        and directions = btrim(directions)
      )
    ),
  constraint academy_public_profiles_logo_image_path_check
    check (
      logo_image_path is null
      or (
        logo_image_path = btrim(logo_image_path)
        and logo_image_path ~ (
          '^'
          || organization_id::text
          || '/logo/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$'
        )
      )
    ),
  constraint academy_public_profiles_cover_image_path_check
    check (
      cover_image_path is null
      or (
        cover_image_path = btrim(cover_image_path)
        and cover_image_path ~ (
          '^'
          || organization_id::text
          || '/cover/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$'
        )
      )
    )
);

alter table public.academy_public_profiles enable row level security;

revoke all on table public.academy_public_profiles from anon;
revoke all on table public.academy_public_profiles from authenticated;
grant select, insert, update on table public.academy_public_profiles to authenticated;

drop policy if exists academy_public_profiles_select_same_org on public.academy_public_profiles;
create policy academy_public_profiles_select_same_org
on public.academy_public_profiles
for select
to authenticated
using (
  app.current_org_id() is not null
  and organization_id = app.current_org_id()
);

drop policy if exists academy_public_profiles_insert_academy_org on public.academy_public_profiles;
create policy academy_public_profiles_insert_academy_org
on public.academy_public_profiles
for insert
to authenticated
with check (
  organization_id = app.current_org_id()
  and updated_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'academy'
      and p.organization_id = academy_public_profiles.organization_id
  )
);

drop policy if exists academy_public_profiles_update_academy_org on public.academy_public_profiles;
create policy academy_public_profiles_update_academy_org
on public.academy_public_profiles
for update
to authenticated
using (
  organization_id = app.current_org_id()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'academy'
      and p.organization_id = academy_public_profiles.organization_id
  )
)
with check (
  organization_id = app.current_org_id()
  and updated_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'academy'
      and p.organization_id = academy_public_profiles.organization_id
  )
);

drop policy if exists academy_public_profiles_delete_academy_org on public.academy_public_profiles;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.academy_public_profiles'::regclass
      and tgname = 'set_academy_public_profiles_updated_at'
      and not tgisinternal
  ) then
    create trigger set_academy_public_profiles_updated_at
    before update on public.academy_public_profiles
    for each row execute function public.set_updated_at();
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'academy-profile-assets'
  ) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'academy-profile-assets',
      'academy-profile-assets',
      true,
      10485760,
      array['image/jpeg', 'image/png', 'image/webp']
    );
  else
    update storage.buckets
      set name = 'academy-profile-assets',
          public = true,
          file_size_limit = 10485760,
          allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
    where id = 'academy-profile-assets';
  end if;
end
$$;

drop policy if exists "public_read_academy_profile_assets" on storage.objects;
create policy "public_read_academy_profile_assets"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'academy-profile-assets'
);

drop policy if exists "academy_insert_academy_profile_assets_in_org_path" on storage.objects;
create policy "academy_insert_academy_profile_assets_in_org_path"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'academy-profile-assets'
  and app.current_org_id() is not null
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'academy'
      and p.organization_id = app.current_org_id()
  )
  and (storage.foldername(name))[1] = app.current_org_id()::text
  and (storage.foldername(name))[2] in ('logo', 'cover')
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$'
);

drop policy if exists "academy_update_academy_profile_assets_in_org_path" on storage.objects;
create policy "academy_update_academy_profile_assets_in_org_path"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'academy-profile-assets'
  and app.current_org_id() is not null
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'academy'
      and p.organization_id = app.current_org_id()
  )
  and (storage.foldername(name))[1] = app.current_org_id()::text
  and (storage.foldername(name))[2] in ('logo', 'cover')
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$'
)
with check (
  bucket_id = 'academy-profile-assets'
  and app.current_org_id() is not null
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'academy'
      and p.organization_id = app.current_org_id()
  )
  and (storage.foldername(name))[1] = app.current_org_id()::text
  and (storage.foldername(name))[2] in ('logo', 'cover')
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$'
);

drop policy if exists "academy_delete_academy_profile_assets_in_org_path" on storage.objects;
create policy "academy_delete_academy_profile_assets_in_org_path"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'academy-profile-assets'
  and app.current_org_id() is not null
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'academy'
      and p.organization_id = app.current_org_id()
  )
  and (storage.foldername(name))[1] = app.current_org_id()::text
  and (storage.foldername(name))[2] in ('logo', 'cover')
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$'
);
