-- RouteRelay Phase 2: corridor-based traveler matching (PostGIS)
-- Finds scheduled/active routes whose origin→destination corridor
-- (default 5 km) covers both shop pickup and village drop-off.

set search_path to public, extensions, auth;

create or replace function public.find_routes_in_corridor(
  p_shop_lng double precision,
  p_shop_lat double precision,
  p_dropoff_lng double precision,
  p_dropoff_lat double precision,
  p_corridor_meters double precision default 5000,
  p_limit integer default 50
)
returns table (
  route_id uuid,
  traveler_id uuid,
  origin_name text,
  destination_name text,
  origin_lng double precision,
  origin_lat double precision,
  destination_lng double precision,
  destination_lat double precision,
  departure_time timestamptz,
  max_cargo_size public.cargo_size,
  max_detour_meters integer,
  status public.route_status,
  traveler_full_name text,
  trust_score numeric,
  approx_baseline_m double precision,
  approx_via_m double precision,
  approx_extra_m double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with points as (
    select
      ST_SetSRID(ST_MakePoint(p_shop_lng, p_shop_lat), 4326)::geography as shop,
      ST_SetSRID(ST_MakePoint(p_dropoff_lng, p_dropoff_lat), 4326)::geography as dropoff
  ),
  candidates as (
    select
      tr.id as route_id,
      tr.traveler_id,
      tr.origin_name,
      tr.destination_name,
      ST_X(tr.origin_geom::geometry) as origin_lng,
      ST_Y(tr.origin_geom::geometry) as origin_lat,
      ST_X(tr.destination_geom::geometry) as destination_lng,
      ST_Y(tr.destination_geom::geometry) as destination_lat,
      tr.departure_time,
      tr.max_cargo_size,
      tr.max_detour_meters,
      tr.status,
      p.full_name as traveler_full_name,
      p.trust_score,
      ST_Distance(tr.origin_geom, tr.destination_geom) as approx_baseline_m,
      (
        ST_Distance(tr.origin_geom, pts.shop)
        + ST_Distance(pts.shop, pts.dropoff)
        + ST_Distance(pts.dropoff, tr.destination_geom)
      ) as approx_via_m
    from public.travel_routes tr
    join public.profiles p on p.id = tr.traveler_id
    cross join points pts
    where tr.status in ('scheduled', 'active')
      and ST_DWithin(
        ST_MakeLine(
          tr.origin_geom::geometry,
          tr.destination_geom::geometry
        )::geography,
        pts.shop,
        p_corridor_meters
      )
      and ST_DWithin(
        ST_MakeLine(
          tr.origin_geom::geometry,
          tr.destination_geom::geometry
        )::geography,
        pts.dropoff,
        p_corridor_meters
      )
  )
  select
    c.route_id,
    c.traveler_id,
    c.origin_name,
    c.destination_name,
    c.origin_lng,
    c.origin_lat,
    c.destination_lng,
    c.destination_lat,
    c.departure_time,
    c.max_cargo_size,
    c.max_detour_meters,
    c.status,
    c.traveler_full_name,
    c.trust_score,
    c.approx_baseline_m,
    c.approx_via_m,
    greatest(c.approx_via_m - c.approx_baseline_m, 0)::double precision
      as approx_extra_m
  from candidates c
  order by greatest(c.approx_via_m - c.approx_baseline_m, 0) asc,
           c.trust_score desc,
           c.departure_time asc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.find_routes_in_corridor(
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) to authenticated;

comment on function public.find_routes_in_corridor is
  'Returns travel routes whose 5km (configurable) origin-destination corridor covers shop + dropoff, ordered by approximate detour.';
