/**
 * Escrow lifecycle state machine for RouteRelay orders.
 *
 * Canonical happy path:
 *   FUNDED → CLAIMED → IN_TRANSIT → COMPLETED (RELEASED_TO_TRAVELER)
 */

import type { EscrowStatus } from "@/types/database";

/** Public / UI-facing escrow states (Phase 3 contract). */
export type EscrowMachineState =
  | "FUNDED"
  | "CLAIMED"
  | "IN_TRANSIT"
  | "COMPLETED";

/** Map machine labels ↔ persisted `orders.escrow_status` values. */
export const MACHINE_TO_DB: Record<EscrowMachineState, EscrowStatus> = {
  FUNDED: "funded_escrow",
  CLAIMED: "claimed",
  IN_TRANSIT: "in_transit",
  COMPLETED: "released_to_traveler",
};

export const DB_TO_MACHINE: Partial<Record<EscrowStatus, EscrowMachineState>> =
  {
    funded_escrow: "FUNDED",
    claimed: "CLAIMED",
    in_transit: "IN_TRANSIT",
    released_to_traveler: "COMPLETED",
    completed: "COMPLETED",
  };

/** Allowed transitions for the Phase 3 happy path (+ draft funding). */
export const ESCROW_TRANSITIONS: Record<EscrowStatus, readonly EscrowStatus[]> =
  {
    draft: ["funded_escrow", "cancelled"],
    funded_escrow: ["claimed", "refunded", "cancelled"],
    claimed: ["in_transit", "funded_escrow", "disputed"],
    in_transit: [
      "released_to_traveler",
      "delivered_pending_verification",
      "disputed",
    ],
    delivered_pending_verification: [
      "released_to_traveler",
      "completed",
      "disputed",
    ],
    released_to_traveler: [],
    completed: [],
    disputed: ["released_to_traveler", "refunded", "completed"],
    refunded: [],
    cancelled: [],
  };

export class EscrowTransitionError extends Error {
  constructor(
    message: string,
    readonly from: EscrowStatus,
    readonly to: EscrowStatus,
  ) {
    super(message);
    this.name = "EscrowTransitionError";
  }
}

export function isTransitionAllowed(
  from: EscrowStatus,
  to: EscrowStatus,
): boolean {
  return (ESCROW_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Assert a transition is legal. Throws `EscrowTransitionError` otherwise.
 */
export function assertTransition(
  from: EscrowStatus,
  to: EscrowStatus,
): void {
  if (!isTransitionAllowed(from, to)) {
    throw new EscrowTransitionError(
      `Illegal escrow transition: ${from} → ${to}`,
      from,
      to,
    );
  }
}

export function toMachineState(
  status: EscrowStatus,
): EscrowMachineState | null {
  return DB_TO_MACHINE[status] ?? null;
}

export function nextHappyPathState(
  current: EscrowMachineState,
): EscrowMachineState | null {
  const order: EscrowMachineState[] = [
    "FUNDED",
    "CLAIMED",
    "IN_TRANSIT",
    "COMPLETED",
  ];
  const idx = order.indexOf(current);
  if (idx < 0 || idx === order.length - 1) return null;
  return order[idx + 1];
}

/** Who may initiate a given transition (application-level guard). */
export type TransitionActorRole = "buyer" | "traveler" | "system";

export function requiredActorForTransition(
  to: EscrowStatus,
): TransitionActorRole {
  switch (to) {
    case "funded_escrow":
    case "released_to_traveler":
    case "refunded":
    case "cancelled":
      return "buyer";
    case "claimed":
    case "in_transit":
      return "traveler";
    default:
      return "system";
  }
}

export function assertActorMayTransition(
  to: EscrowStatus,
  actorRole: TransitionActorRole,
): void {
  const required = requiredActorForTransition(to);
  if (required !== "system" && required !== actorRole) {
    throw new EscrowTransitionError(
      `Actor role ${actorRole} cannot transition to ${to} (requires ${required})`,
      "draft",
      to,
    );
  }
}
