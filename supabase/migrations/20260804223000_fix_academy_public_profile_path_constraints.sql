alter table public.academy_public_profiles
  drop constraint if exists academy_public_profiles_logo_image_path_check;

alter table public.academy_public_profiles
  add constraint academy_public_profiles_logo_image_path_check
  check (
    logo_image_path is null
    or (
      logo_image_path = btrim(logo_image_path)
      and logo_image_path ~ (
        '^'
        || organization_id::text
        || '/logo/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      )
    )
  );

alter table public.academy_public_profiles
  drop constraint if exists academy_public_profiles_cover_image_path_check;

alter table public.academy_public_profiles
  add constraint academy_public_profiles_cover_image_path_check
  check (
    cover_image_path is null
    or (
      cover_image_path = btrim(cover_image_path)
      and cover_image_path ~ (
        '^'
        || organization_id::text
        || '/cover/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      )
    )
  );
