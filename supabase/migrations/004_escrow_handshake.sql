-- RouteRelay Phase 3: escrow state machine + handshake verification

set search_path to public, extensions, auth;

-- ---------------------------------------------------------------------------
-- Enum / column extensions
-- ---------------------------------------------------------------------------


alter table public.profiles
  add column if not exists completed_trips integer not null default 0
    check (completed_trips >= 0);

alter table public.orders
  add column if not exists version integer not null default 1,
  add column if not exists funded_at timestamptz;

create index if not exists orders_version_idx on public.orders (id, version);

-- ---------------------------------------------------------------------------
-- handshake_challenges
-- ---------------------------------------------------------------------------

create table if not exists public.handshake_challenges (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  traveler_id uuid not null references public.profiles (id) on delete cascade,
  nonce text not null,
  numeric_token text not null,
  signature_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint handshake_challenges_nonce_unique unique (order_id, nonce)
);

create index if not exists handshake_challenges_order_id_idx
  on public.handshake_challenges (order_id);
create index if not exists handshake_challenges_expires_at_idx
  on public.handshake_challenges (expires_at);

alter table public.handshake_challenges enable row level security;

-- Participants may read challenge metadata (not used for forging — HMAC is server-side)
create policy "handshake_select_participants"
  on public.handshake_challenges for select
  to authenticated
  using (
    traveler_id = auth.uid()
    or exists (
      select 1
      from public.orders o
      join public.delivery_requests dr on dr.id = o.request_id
      where o.id = handshake_challenges.order_id
        and dr.buyer_id = auth.uid()
    )
  );

-- Inserts/updates go through security-definer RPCs only
revoke insert, update, delete on public.handshake_challenges from authenticated;
grant select on public.handshake_challenges to authenticated;

-- ---------------------------------------------------------------------------
-- escrow_events (append-only audit)
-- ---------------------------------------------------------------------------

create table if not exists public.escrow_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.escrow_status,
  to_status public.escrow_status not null,
  actor_id uuid references public.profiles (id) on delete set null,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists escrow_events_order_id_idx
  on public.escrow_events (order_id, created_at desc);

alter table public.escrow_events enable row level security;

create policy "escrow_events_select_participants"
  on public.escrow_events for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      join public.delivery_requests dr on dr.id = o.request_id
      where o.id = escrow_events.order_id
        and (o.traveler_id = auth.uid() or dr.buyer_id = auth.uid())
    )
  );

revoke insert, update, delete on public.escrow_events from authenticated;
grant select on public.escrow_events to authenticated;

-- ---------------------------------------------------------------------------
-- transition_order_escrow — transactional, optimistic-locked
-- ---------------------------------------------------------------------------

create or replace function public.transition_order_escrow(
  p_order_id uuid,
  p_to_status public.escrow_status,
  p_expected_version integer,
  p_route_id uuid default null,
  p_reason text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_actor uuid := auth.uid();
  v_buyer uuid;
  v_allowed boolean := false;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.version <> p_expected_version then
    raise exception 'Optimistic lock conflict (version mismatch)';
  end if;

  select dr.buyer_id into v_buyer
  from public.delivery_requests dr
  where dr.id = v_order.request_id;

  -- Authorization by transition
  if p_to_status = 'funded_escrow' then
    v_allowed := (v_buyer = v_actor and v_order.escrow_status = 'draft');
  elsif p_to_status = 'claimed' then
    v_allowed := (
      v_order.escrow_status = 'funded_escrow'
      and (
        v_order.traveler_id is null
        or v_order.traveler_id = v_actor
      )
    );
  elsif p_to_status = 'in_transit' then
    v_allowed := (
      v_order.escrow_status = 'claimed'
      and v_order.traveler_id = v_actor
    );
  elsif p_to_status = 'released_to_traveler' then
    -- Handshake path only (buyer) — prefer verify_and_release_escrow
    v_allowed := (
      v_order.escrow_status = 'in_transit'
      and v_buyer = v_actor
    );
  else
    v_allowed := false;
  end if;

  if not v_allowed then
    raise exception 'Unauthorized or illegal escrow transition from % to %',
      v_order.escrow_status, p_to_status;
  end if;

  insert into public.escrow_events (order_id, from_status, to_status, actor_id, reason, payload)
  values (
    v_order.id,
    v_order.escrow_status,
    p_to_status,
    v_actor,
    p_reason,
    jsonb_build_object('expected_version', p_expected_version)
  );

  update public.orders o
  set
    escrow_status = p_to_status,
    version = o.version + 1,
    traveler_id = case
      when p_to_status = 'claimed' then v_actor
      else o.traveler_id
    end,
    route_id = coalesce(p_route_id, o.route_id),
    funded_at = case
      when p_to_status = 'funded_escrow' then coalesce(o.funded_at, now())
      else o.funded_at
    end,
    claimed_at = case
      when p_to_status = 'claimed' then coalesce(o.claimed_at, now())
      else o.claimed_at
    end,
    completed_at = case
      when p_to_status = 'released_to_traveler' then now()
      else o.completed_at
    end,
    updated_at = now()
  where o.id = p_order_id
  returning * into v_order;

  -- Mirror request status for core lifecycle
  if p_to_status = 'claimed' then
    update public.delivery_requests
    set status = 'matched', updated_at = now()
    where id = v_order.request_id;
  elsif p_to_status = 'in_transit' then
    update public.delivery_requests
    set status = 'in_transit', updated_at = now()
    where id = v_order.request_id;
  elsif p_to_status = 'released_to_traveler' then
    update public.delivery_requests
    set status = 'completed', updated_at = now()
    where id = v_order.request_id;
  elsif p_to_status = 'funded_escrow' then
    update public.delivery_requests
    set status = 'open', updated_at = now()
    where id = v_order.request_id and status = 'draft';
  end if;

  return v_order;
end;
$$;

grant execute on function public.transition_order_escrow(
  uuid, public.escrow_status, integer, uuid, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- register_handshake_challenge
-- ---------------------------------------------------------------------------

create or replace function public.register_handshake_challenge(
  p_order_id uuid,
  p_nonce text,
  p_numeric_token text,
  p_signature_hash text,
  p_expires_at timestamptz
)
returns public.handshake_challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_actor uuid := auth.uid();
  v_row public.handshake_challenges;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.traveler_id is distinct from v_actor then
    raise exception 'Only the assigned traveler can issue handshake tokens';
  end if;

  if v_order.escrow_status <> 'in_transit' then
    raise exception 'Handshake tokens require IN_TRANSIT escrow status';
  end if;

  -- Invalidate prior unused challenges for this order
  update public.handshake_challenges
  set consumed_at = coalesce(consumed_at, now())
  where order_id = p_order_id
    and consumed_at is null;

  insert into public.handshake_challenges (
    order_id, traveler_id, nonce, numeric_token, signature_hash, expires_at
  )
  values (
    p_order_id, v_actor, p_nonce, p_numeric_token, p_signature_hash, p_expires_at
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.register_handshake_challenge(
  uuid, text, text, text, timestamptz
) to authenticated;

-- ---------------------------------------------------------------------------
-- verify_and_release_escrow — single DB transaction after HMAC verified in app
-- ---------------------------------------------------------------------------

create or replace function public.verify_and_release_escrow(
  p_order_id uuid,
  p_signature_hash text,
  p_expected_version integer
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_buyer uuid;
  v_actor uuid := auth.uid();
  v_challenge public.handshake_challenges;
  v_amount numeric(12, 2);
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.version <> p_expected_version then
    raise exception 'Optimistic lock conflict (version mismatch)';
  end if;

  if v_order.escrow_status <> 'in_transit' then
    raise exception 'Order must be IN_TRANSIT to release funds';
  end if;

  select dr.buyer_id, dr.total_escrow
  into v_buyer, v_amount
  from public.delivery_requests dr
  where dr.id = v_order.request_id;

  if v_buyer is distinct from v_actor then
    raise exception 'Only the buyer can verify delivery and release funds';
  end if;

  select * into v_challenge
  from public.handshake_challenges hc
  where hc.order_id = p_order_id
    and hc.signature_hash = p_signature_hash
    and hc.consumed_at is null
  order by hc.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Invalid or already consumed handshake token';
  end if;

  if v_challenge.expires_at < now() then
    raise exception 'Handshake token expired';
  end if;

  update public.handshake_challenges
  set consumed_at = now()
  where id = v_challenge.id;

  insert into public.escrow_events (order_id, from_status, to_status, actor_id, reason, payload)
  values (
    v_order.id,
    v_order.escrow_status,
    'released_to_traveler',
    v_actor,
    'qr_handshake_verified',
    jsonb_build_object(
      'challenge_id', v_challenge.id,
      'signature_hash', p_signature_hash
    )
  );

  update public.orders o
  set
    escrow_status = 'released_to_traveler',
    version = o.version + 1,
    completed_at = now(),
    updated_at = now()
  where o.id = p_order_id
  returning * into v_order;

  update public.delivery_requests
  set status = 'completed', updated_at = now()
  where id = v_order.request_id;

  update public.profiles
  set
    completed_trips = completed_trips + 1,
    updated_at = now()
  where id = v_order.traveler_id;

  insert into public.transactions (
    order_id,
    request_id,
    traveler_id,
    escrow_status,
    payment_reference,
    amount,
    direction,
    note,
    completed_at
  )
  values (
    v_order.id,
    v_order.request_id,
    v_order.traveler_id,
    'released_to_traveler',
    coalesce(v_order.payment_reference, v_order.id::text),
    coalesce(v_amount, 0),
    'credit',
    'Escrow released to traveler after QR handshake',
    now()
  );

  return v_order;
end;
$$;

grant execute on function public.verify_and_release_escrow(
  uuid, text, integer
) to authenticated;
