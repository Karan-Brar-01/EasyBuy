-- RouteRelay Phase 1: initial schema (PostGIS + RLS)
-- Apply with Supabase CLI or SQL editor after enabling PostGIS.

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Ensure geography/geometry resolve when PostGIS lives in `extensions`
set search_path to public, extensions, auth;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('buyer', 'traveler', 'both');

create type public.vehicle_type as enum (
  'none',
  'bicycle',
  'motorcycle',
  'scooter',
  'car',
  'van',
  'other'
);

create type public.route_status as enum (
  'scheduled',
  'active',
  'completed',
  'cancelled'
);

create type public.cargo_size as enum ('small', 'medium', 'large', 'xlarge');

create type public.request_status as enum (
  'draft',
  'open',
  'matched',
  'in_transit',
  'delivered',
  'completed',
  'cancelled',
  'expired'
);

create type public.escrow_status as enum (
  'draft',
  'funded_escrow',
  'claimed',
  'in_transit',
  'delivered_pending_verification',
  'completed',
  'disputed',
  'refunded',
  'cancelled'
);

create type public.item_category as enum (
  'groceries',
  'pharmacy',
  'electronics',
  'clothing',
  'documents',
  'other'
);

-- ---------------------------------------------------------------------------
-- profiles (extends auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  role public.user_role not null default 'buyer',
  trust_score numeric(4, 2) not null default 5.00
    check (trust_score >= 0 and trust_score <= 10),
  vehicle_type public.vehicle_type not null default 'none',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);
create index profiles_trust_score_idx on public.profiles (trust_score desc);

-- ---------------------------------------------------------------------------
-- travel_routes
-- ---------------------------------------------------------------------------

create table public.travel_routes (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.profiles (id) on delete cascade,
  origin_name text not null,
  origin_geom geography(point, 4326) not null,
  destination_name text not null,
  destination_geom geography(point, 4326) not null,
  departure_time timestamptz not null,
  max_cargo_size public.cargo_size not null default 'medium',
  status public.route_status not null default 'scheduled',
  max_detour_meters integer not null default 5000 check (max_detour_meters > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index travel_routes_traveler_id_idx on public.travel_routes (traveler_id);
create index travel_routes_status_departure_idx
  on public.travel_routes (status, departure_time);
create index travel_routes_origin_geom_gix
  on public.travel_routes using gist (origin_geom);
create index travel_routes_destination_geom_gix
  on public.travel_routes using gist (destination_geom);

-- ---------------------------------------------------------------------------
-- delivery_requests
-- ---------------------------------------------------------------------------

create table public.delivery_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  category public.item_category not null default 'other',
  description text,
  shop_location_name text not null,
  shop_geom geography(point, 4326) not null,
  dropoff_geom geography(point, 4326) not null,
  dropoff_name text,
  item_price numeric(12, 2) not null check (item_price >= 0),
  bounty_fee numeric(12, 2) not null check (bounty_fee >= 0),
  total_escrow numeric(12, 2) not null check (total_escrow >= 0),
  status public.request_status not null default 'draft',
  qr_secret text,
  needed_by timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_requests_escrow_sum_chk
    check (total_escrow = item_price + bounty_fee)
);

create index delivery_requests_buyer_id_idx on public.delivery_requests (buyer_id);
create index delivery_requests_status_idx on public.delivery_requests (status);
create index delivery_requests_shop_geom_gix
  on public.delivery_requests using gist (shop_geom);
create index delivery_requests_dropoff_geom_gix
  on public.delivery_requests using gist (dropoff_geom);

-- Public gig listing without qr_secret (travelers / marketplace)
create or replace view public.open_gigs
with (security_invoker = true)
as
select
  id,
  buyer_id,
  title,
  category,
  description,
  shop_location_name,
  shop_geom,
  dropoff_geom,
  dropoff_name,
  item_price,
  bounty_fee,
  total_escrow,
  status,
  needed_by,
  created_at,
  updated_at
from public.delivery_requests
where status = 'open';

-- ---------------------------------------------------------------------------
-- orders (escrow + assignment lifecycle)
-- ---------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.delivery_requests (id) on delete restrict,
  traveler_id uuid references public.profiles (id) on delete set null,
  route_id uuid references public.travel_routes (id) on delete set null,
  escrow_status public.escrow_status not null default 'draft',
  payment_reference text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index orders_traveler_id_idx on public.orders (traveler_id);
create index orders_escrow_status_idx on public.orders (escrow_status);

-- ---------------------------------------------------------------------------
-- transactions (ledger / payment events against an order)
-- ---------------------------------------------------------------------------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  request_id uuid not null references public.delivery_requests (id) on delete restrict,
  traveler_id uuid references public.profiles (id) on delete set null,
  escrow_status public.escrow_status not null,
  payment_reference text,
  amount numeric(12, 2) not null check (amount >= 0),
  direction text not null check (direction in ('debit', 'credit')),
  note text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index transactions_order_id_idx on public.transactions (order_id);
create index transactions_request_id_idx on public.transactions (request_id);
create index transactions_payment_reference_idx
  on public.transactions (payment_reference);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger travel_routes_set_updated_at
  before update on public.travel_routes
  for each row execute function public.set_updated_at();

create trigger delivery_requests_set_updated_at
  before update on public.delivery_requests
  for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'phone',
    coalesce(
      (new.raw_user_meta_data ->> 'role')::public.user_role,
      'buyer'::public.user_role
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.travel_routes enable row level security;
alter table public.delivery_requests enable row level security;
alter table public.orders enable row level security;
alter table public.transactions enable row level security;

-- profiles
create policy "profiles_select_own_or_public_trust"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- travel_routes: anyone authenticated can read active/scheduled gigs;
-- travelers mutate only their own rows
create policy "travel_routes_select_active_or_own"
  on public.travel_routes for select
  to authenticated
  using (
    traveler_id = auth.uid()
    or status in ('scheduled', 'active')
  );

create policy "travel_routes_insert_own"
  on public.travel_routes for insert
  to authenticated
  with check (traveler_id = auth.uid());

create policy "travel_routes_update_own"
  on public.travel_routes for update
  to authenticated
  using (traveler_id = auth.uid())
  with check (traveler_id = auth.uid());

create policy "travel_routes_delete_own"
  on public.travel_routes for delete
  to authenticated
  using (traveler_id = auth.uid());

-- delivery_requests: buyers full control of own;
-- travelers/buyers can read open (active) gigs
create policy "delivery_requests_select_own_or_open"
  on public.delivery_requests for select
  to authenticated
  using (
    buyer_id = auth.uid()
    or status = 'open'
  );

create policy "delivery_requests_insert_own"
  on public.delivery_requests for insert
  to authenticated
  with check (buyer_id = auth.uid());

create policy "delivery_requests_update_own"
  on public.delivery_requests for update
  to authenticated
  using (buyer_id = auth.uid())
  with check (buyer_id = auth.uid());

create policy "delivery_requests_delete_own_draft"
  on public.delivery_requests for delete
  to authenticated
  using (buyer_id = auth.uid() and status = 'draft');

-- orders: participants only (buyer via request, or assigned traveler)
create policy "orders_select_participants"
  on public.orders for select
  to authenticated
  using (
    traveler_id = auth.uid()
    or exists (
      select 1
      from public.delivery_requests dr
      where dr.id = orders.request_id
        and dr.buyer_id = auth.uid()
    )
  );

create policy "orders_insert_buyer"
  on public.orders for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.delivery_requests dr
      where dr.id = request_id
        and dr.buyer_id = auth.uid()
    )
  );

create policy "orders_update_participants"
  on public.orders for update
  to authenticated
  using (
    traveler_id = auth.uid()
    or exists (
      select 1
      from public.delivery_requests dr
      where dr.id = orders.request_id
        and dr.buyer_id = auth.uid()
    )
  )
  with check (
    traveler_id = auth.uid()
    or exists (
      select 1
      from public.delivery_requests dr
      where dr.id = orders.request_id
        and dr.buyer_id = auth.uid()
    )
    or traveler_id is null
  );

-- transactions: same participant scope as parent order
create policy "transactions_select_participants"
  on public.transactions for select
  to authenticated
  using (
    traveler_id = auth.uid()
    or exists (
      select 1
      from public.delivery_requests dr
      where dr.id = transactions.request_id
        and dr.buyer_id = auth.uid()
    )
  );

create policy "transactions_insert_participants"
  on public.transactions for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.orders o
      join public.delivery_requests dr on dr.id = o.request_id
      where o.id = order_id
        and (o.traveler_id = auth.uid() or dr.buyer_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, update, insert on public.profiles to authenticated;
grant select, insert, update, delete on public.travel_routes to authenticated;
grant select, insert, update, delete on public.delivery_requests to authenticated;
grant select, insert, update on public.orders to authenticated;
grant select, insert on public.transactions to authenticated;
grant select on public.open_gigs to authenticated;
