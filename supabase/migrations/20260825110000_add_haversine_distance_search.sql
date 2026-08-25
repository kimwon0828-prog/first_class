-- Phase 2A: 좌표 기반 반경 검색 기반 (PostGIS 미사용)
-- organizations.latitude / longitude 만을 공간 canonical 로 사용한다.
-- academy_area / classes.region 은 이 함수들에서 참조하지 않는다.

-- 두 위경도 사이의 대권거리(km).
-- asin 기반 haversine 을 사용하고, 부동소수 오차로 a 가 [0, 1] 을 벗어나는 경우를 clamp 한다.
create or replace function public.haversine_distance_km(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
immutable
strict
parallel safe
as $$
  select 2 * 6371.0088 * asin(
    sqrt(
      least(
        1.0,
        greatest(
          0.0,
          power(sin(radians(lat2 - lat1) / 2), 2)
            + cos(radians(lat1)) * cos(radians(lat2))
              * power(sin(radians(lon2 - lon1) / 2), 2)
        )
      )
    )
  );
$$;

comment on function public.haversine_distance_km(double precision, double precision, double precision, double precision)
  is 'Great-circle distance in km (earth radius 6371.0088km). Clamped haversine, no PostGIS.';

-- 기준 좌표 반경 내 organization 을 거리순으로 반환한다.
-- 반환값은 organization_id / distance_km 로 최소화하며, 그 외 조직 정보는 application query 가 별도로 읽는다.
create or replace function public.find_nearby_organizations(
  origin_lat double precision,
  origin_lng double precision,
  radius_km double precision,
  limit_count integer default 100,
  offset_count integer default 0
)
returns table (
  organization_id uuid,
  distance_km double precision
)
language plpgsql
stable
parallel safe
as $$
begin
  if origin_lat is null or origin_lng is null then
    raise exception 'invalid_origin_coordinates';
  end if;

  if origin_lat < -90 or origin_lat > 90 then
    raise exception 'invalid_origin_latitude';
  end if;

  if origin_lng < -180 or origin_lng > 180 then
    raise exception 'invalid_origin_longitude';
  end if;

  if radius_km is null or radius_km <= 0 then
    raise exception 'invalid_radius_km';
  end if;

  if limit_count is null or limit_count <= 0 or limit_count > 500 then
    raise exception 'invalid_limit_count';
  end if;

  if offset_count is null or offset_count < 0 then
    raise exception 'invalid_offset_count';
  end if;

  return query
  select
    nearby.nearby_organization_id,
    nearby.nearby_distance_km
  from (
    select
      organization.id as nearby_organization_id,
      public.haversine_distance_km(
        origin_lat,
        origin_lng,
        organization.latitude,
        organization.longitude
      ) as nearby_distance_km
    from public.organizations as organization
    where organization.latitude is not null
      and organization.longitude is not null
  ) as nearby
  where nearby.nearby_distance_km <= radius_km
  order by nearby.nearby_distance_km asc, nearby.nearby_organization_id asc
  limit limit_count
  offset offset_count;
end;
$$;

comment on function public.find_nearby_organizations(double precision, double precision, double precision, integer, integer)
  is 'Organizations with a complete coordinate pair within radius_km of the origin, nearest first. Server/service-role only.';

-- 서버(service_role) 전용. anon / authenticated 브라우저 경로에는 노출하지 않는다.
revoke all on function public.haversine_distance_km(double precision, double precision, double precision, double precision) from public;
revoke all on function public.haversine_distance_km(double precision, double precision, double precision, double precision) from anon;
revoke all on function public.haversine_distance_km(double precision, double precision, double precision, double precision) from authenticated;
grant execute on function public.haversine_distance_km(double precision, double precision, double precision, double precision) to service_role;

revoke all on function public.find_nearby_organizations(double precision, double precision, double precision, integer, integer) from public;
revoke all on function public.find_nearby_organizations(double precision, double precision, double precision, integer, integer) from anon;
revoke all on function public.find_nearby_organizations(double precision, double precision, double precision, integer, integer) from authenticated;
grant execute on function public.find_nearby_organizations(double precision, double precision, double precision, integer, integer) to service_role;
