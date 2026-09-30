"use server";

import {
  generateHandshakePayload,
  verifyHandshakeToken,
} from "@/lib/escrow/handshake";
import {
  assertActorMayTransition,
  assertTransition,
  MACHINE_TO_DB,
  type EscrowMachineState,
} from "@/lib/escrow/state-machine";
import { createClient } from "@/lib/supabase/server";
import type { EscrowStatus, Order } from "@/types/database";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type HandshakeDisplay = {
  token: string;
  numericToken: string;
  expiresAt: number;
  ttlSeconds: number;
  challengeId: string;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase, user: null as null, error: "Authentication required" };
  }
  return { supabase, user, error: null as null };
}

/**
 * Advance an order along the escrow machine via the transactional RPC.
 * Happy path: FUNDED → CLAIMED → IN_TRANSIT.
 * COMPLETED / fund release must go through `verifyDeliveryAndReleaseFunds`.
 */
export async function transitionEscrowState(
  orderId: string,
  toState: EscrowMachineState,
  options?: { routeId?: string; reason?: string },
): Promise<ActionResult<Order>> {
  if (toState === "COMPLETED") {
    return {
      ok: false,
      error:
        "Use verifyDeliveryAndReleaseFunds() to complete and release escrow",
    };
  }

  const { supabase, user, error: authError } = await requireUser();
  if (authError || !user) {
    return { ok: false, error: authError ?? "Authentication required" };
  }

  const toStatus = MACHINE_TO_DB[toState];
  const actorRole =
    toState === "FUNDED" ? ("buyer" as const) : ("traveler" as const);

  try {
    assertActorMayTransition(toStatus, actorRole);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unauthorized transition",
    };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) return { ok: false, error: orderError.message };
  if (!order) return { ok: false, error: "Order not found" };

  try {
    assertTransition(order.escrow_status, toStatus);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Illegal transition",
    };
  }

  const { data, error } = await supabase.rpc("transition_order_escrow", {
    p_order_id: orderId,
    p_to_status: toStatus,
    p_expected_version: order.version,
    p_route_id: options?.routeId ?? null,
    p_reason: options?.reason ?? `transition_to_${toState}`,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export async function claimOrder(
  orderId: string,
  routeId: string,
): Promise<ActionResult<Order>> {
  return transitionEscrowState(orderId, "CLAIMED", {
    routeId,
    reason: "traveler_claimed_gig",
  });
}

export async function markOrderInTransit(
  orderId: string,
): Promise<ActionResult<{ order: Order; handshake: HandshakeDisplay }>> {
  const transitioned = await transitionEscrowState(orderId, "IN_TRANSIT", {
    reason: "traveler_marked_purchased_in_transit",
  });
  if (!transitioned.ok) return transitioned;

  const handshake = await issueHandshakeQr(orderId);
  if (!handshake.ok) return handshake;

  return {
    ok: true,
    data: { order: transitioned.data, handshake: handshake.data },
  };
}

/**
 * Traveler: mint / rotate a time-hashed QR + numeric fallback for an IN_TRANSIT order.
 */
export async function issueHandshakeQr(
  orderId: string,
): Promise<ActionResult<HandshakeDisplay>> {
  const { supabase, user, error: authError } = await requireUser();
  if (authError || !user) {
    return { ok: false, error: authError ?? "Authentication required" };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, traveler_id, escrow_status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) return { ok: false, error: orderError.message };
  if (!order) return { ok: false, error: "Order not found" };
  if (order.traveler_id !== user.id) {
    return { ok: false, error: "Only the assigned traveler can display the QR" };
  }
  if (order.escrow_status !== "in_transit") {
    return {
      ok: false,
      error: "Handshake QR is only available while order is IN_TRANSIT",
    };
  }

  let payload: ReturnType<typeof generateHandshakePayload>;
  try {
    payload = generateHandshakePayload(orderId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to mint handshake",
    };
  }

  const { data: challenge, error: challengeError } = await supabase.rpc(
    "register_handshake_challenge",
    {
      p_order_id: orderId,
      p_nonce: payload.nonce,
      p_numeric_token: payload.numericToken,
      p_signature_hash: payload.signatureHash,
      p_expires_at: new Date(payload.expiresAt * 1000).toISOString(),
    },
  );

  if (challengeError) return { ok: false, error: challengeError.message };

  return {
    ok: true,
    data: {
      token: payload.token,
      numericToken: payload.numericToken,
      expiresAt: payload.expiresAt,
      ttlSeconds: payload.ttlSeconds,
      challengeId: challenge.id,
    },
  };
}

/**
 * Buyer: scan QR (or enter numeric code) → verify HMAC → release escrow in one DB txn.
 * Updates delivery_requests.status → completed, orders.escrow_status → released_to_traveler,
 * and increments profiles.completed_trips for the traveler.
 */
export async function verifyDeliveryAndReleaseFunds(
  orderId: string,
  tokenOrNumeric: string,
): Promise<
  ActionResult<{
    order: Order;
    requestStatus: "completed";
    escrowStatus: Extract<EscrowStatus, "released_to_traveler">;
  }>
> {
  const { supabase, user, error: authError } = await requireUser();
  if (authError || !user) {
    return { ok: false, error: authError ?? "Authentication required" };
  }

  const trimmed = tokenOrNumeric.trim();
  if (!trimmed) {
    return { ok: false, error: "Verification token is required" };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) return { ok: false, error: orderError.message };
  if (!order) return { ok: false, error: "Order not found" };

  const { data: request, error: requestError } = await supabase
    .from("delivery_requests")
    .select("id, buyer_id, status")
    .eq("id", order.request_id)
    .maybeSingle();

  if (requestError) return { ok: false, error: requestError.message };
  if (!request) return { ok: false, error: "Delivery request not found" };
  if (request.buyer_id !== user.id) {
    return { ok: false, error: "Only the buyer can verify and release funds" };
  }

  if (order.escrow_status !== "in_transit") {
    return {
      ok: false,
      error: `Order escrow must be IN_TRANSIT (currently ${order.escrow_status})`,
    };
  }

  try {
    assertTransition(order.escrow_status, "released_to_traveler");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Illegal transition",
    };
  }

  let signatureHash: string;
  try {
    if (/^\d{8}$/.test(trimmed)) {
      const { data: challenge, error: challengeError } = await supabase
        .from("handshake_challenges")
        .select("*")
        .eq("order_id", orderId)
        .is("consumed_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (challengeError) return { ok: false, error: challengeError.message };
      if (!challenge) {
        return {
          ok: false,
          error: "No active handshake challenge for this order",
        };
      }

      const verified = verifyHandshakeToken(trimmed, {
        challenge: {
          orderId: challenge.order_id,
          nonce: challenge.nonce,
          expiresAt: Math.floor(
            new Date(challenge.expires_at).getTime() / 1000,
          ),
          numericToken: challenge.numeric_token,
          signatureHash: challenge.signature_hash,
        },
      });
      if (verified.orderId !== orderId) {
        return { ok: false, error: "Token does not match this order" };
      }
      signatureHash = verified.signatureHash;
    } else {
      const verified = verifyHandshakeToken(trimmed);
      if (verified.orderId !== orderId) {
        return { ok: false, error: "Token does not match this order" };
      }
      signatureHash = verified.signatureHash;
    }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Handshake verification failed",
    };
  }

  const { data: released, error: releaseError } = await supabase.rpc(
    "verify_and_release_escrow",
    {
      p_order_id: orderId,
      p_signature_hash: signatureHash,
      p_expected_version: order.version,
    },
  );

  if (releaseError) return { ok: false, error: releaseError.message };

  return {
    ok: true,
    data: {
      order: released,
      requestStatus: "completed",
      escrowStatus: "released_to_traveler",
    },
  };
}
