-- Phase 4: trip vehicle capacity on travel routes (Bike / Car / Bus)

set search_path to public, extensions, auth;

create type public.trip_vehicle as enum ('bike', 'car', 'bus');

alter table public.travel_routes
  add column if not exists trip_vehicle public.trip_vehicle not null default 'bike';

comment on column public.travel_routes.trip_vehicle is
  'Vehicle capacity class shown when publishing a commute trip';
