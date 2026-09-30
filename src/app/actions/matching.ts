"use server";

import { calculateDynamicBounty } from "@/lib/analytics/pricing";
import {
  calculateDeviationPenalty,
  toLatLng,
  type LatLng,
} from "@/lib/geo/routing";
import { createClient } from "@/lib/supabase/server";
import type { CargoSize, RouteStatus } from "@/types/database";

const DEFAULT_CORRIDOR_METERS = 5_000;
const DEFAULT_CANDIDATE_LIMIT = 25;
/** Cap ORS refinement calls per request (cost / latency control) */
const MAX_ORS_REFINEMENTS = 15;

export type MatchingTraveler = {
  routeId: string;
  travelerId: string;
  travelerName: string | null;
  trustScore: number;
  originName: string;
  destinationName: string;
  departureTime: string;
  maxCargoSize: CargoSize;
  maxDetourMeters: number;
  status: RouteStatus;
  /** Approximate geodesic detour from PostGIS (meters) */
  approxExtraMeters: number;
  /** Road-network detour from ORS (when available) */
  deviationKm: number;
  deviationMins: number;
  deviationMeters: number;
  suggestedBounty: number;
  bountyBreakdown: ReturnType<typeof calculateDynamicBounty>;
  routeProvider: "openrouteservice" | "haversine_fallback";
};

export type FindMatchingTravelersResult =
  | {
      ok: true;
      requestId: string;
      corridorMeters: number;
      matches: MatchingTraveler[];
    }
  | {
      ok: false;
      error: string;
    };

function pointFromRequestGeom(
  geom: { type: "Point"; coordinates: [number, number] } | null | undefined,
  label: string,
): LatLng {
  if (!geom?.coordinates) {
    throw new Error(`Delivery request is missing ${label} coordinates`);
  }
  return toLatLng(geom);
}

/**
 * Rank travelers whose route corridor covers the request's shop + dropoff,
 * ordered by minimum road-network deviation penalty (ORS), with dynamic bounty.
 */
export async function findMatchingTravelers(
  requestId: string,
  options?: {
    corridorMeters?: number;
    limit?: number;
  },
): Promise<FindMatchingTravelersResult> {
  if (!requestId || typeof requestId !== "string") {
    return { ok: false, error: "requestId is required" };
  }

  const corridorMeters = options?.corridorMeters ?? DEFAULT_CORRIDOR_METERS;
  const limit = options?.limit ?? DEFAULT_CANDIDATE_LIMIT;

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "Authentication required" };
  }

  const { data: request, error: requestError } = await supabase
    .from("delivery_requests")
    .select(
      "id, buyer_id, status, shop_geom, dropoff_geom, needed_by, bounty_fee",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) {
    return { ok: false, error: requestError.message };
  }
  if (!request) {
    return { ok: false, error: "Delivery request not found" };
  }

  let shop: LatLng;
  let dropoff: LatLng;
  try {
    shop = pointFromRequestGeom(request.shop_geom, "shop");
    dropoff = pointFromRequestGeom(request.dropoff_geom, "dropoff");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid request geometry",
    };
  }

  const { data: corridorRows, error: rpcError } = await supabase.rpc(
    "find_routes_in_corridor",
    {
      p_shop_lng: shop.lng,
      p_shop_lat: shop.lat,
      p_dropoff_lng: dropoff.lng,
      p_dropoff_lat: dropoff.lat,
      p_corridor_meters: corridorMeters,
      p_limit: limit,
    },
  );

  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }

  const candidates = corridorRows ?? [];
  if (candidates.length === 0) {
    return {
      ok: true,
      requestId,
      corridorMeters,
      matches: [],
    };
  }

  const toRefine = candidates.slice(0, MAX_ORS_REFINEMENTS);
  const matches: MatchingTraveler[] = [];

  for (const row of toRefine) {
    try {
      const penalty = await calculateDeviationPenalty(
        {
          origin: { lat: row.origin_lat, lng: row.origin_lng },
          destination: {
            lat: row.destination_lat,
            lng: row.destination_lng,
          },
        },
        shop,
        dropoff,
      );

      if (penalty.extraMeters > row.max_detour_meters) {
        continue;
      }

      const bountyBreakdown = calculateDynamicBounty(
        penalty.extraKm,
        penalty.extraMins,
        { neededBy: request.needed_by },
      );

      matches.push({
        routeId: row.route_id,
        travelerId: row.traveler_id,
        travelerName: row.traveler_full_name,
        trustScore: Number(row.trust_score),
        originName: row.origin_name,
        destinationName: row.destination_name,
        departureTime: row.departure_time,
        maxCargoSize: row.max_cargo_size,
        maxDetourMeters: row.max_detour_meters,
        status: row.status,
        approxExtraMeters: row.approx_extra_m,
        deviationKm: penalty.extraKm,
        deviationMins: penalty.extraMins,
        deviationMeters: penalty.extraMeters,
        suggestedBounty: bountyBreakdown.bountyFee,
        bountyBreakdown,
        routeProvider: penalty.withDetour.provider,
      });
    } catch {
      // Skip candidates that fail routing; PostGIS approx already ranked them.
      continue;
    }
  }

  matches.sort((a, b) => {
    if (a.deviationMeters !== b.deviationMeters) {
      return a.deviationMeters - b.deviationMeters;
    }
    return b.trustScore - a.trustScore;
  });

  return {
    ok: true,
    requestId,
    corridorMeters,
    matches,
  };
}
