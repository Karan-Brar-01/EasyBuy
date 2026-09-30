"use server";

import {
  buildCombinedBountyCards,
  type CombinedBountyTripCard,
} from "@/lib/analytics/clustering";
import { calculateDynamicBounty } from "@/lib/analytics/pricing";
import {
  calculateDeviationPenalty,
  haversineMeters,
  toLatLng,
  type LatLng,
} from "@/lib/geo/routing";
import { createClient } from "@/lib/supabase/server";
import type { DeliveryRequest, TravelRoute } from "@/types/database";

export type MarketplaceGig = {
  request: DeliveryRequest;
  shop: LatLng;
  dropoff: LatLng;
  detourLabel: string;
  detourMins: number;
  estimatedPayout: number;
  matchedRouteId: string | null;
};

function pointOrNull(
  geom: DeliveryRequest["shop_geom"] | null | undefined,
): LatLng | null {
  try {
    if (!geom) return null;
    return toLatLng(geom);
  } catch {
    return null;
  }
}

/**
 * Live open gigs for the marketplace feed.
 * When the viewer has an upcoming route, ranks detour against that corridor.
 * Also returns Combined Bounty trip cards from spatial clustering.
 */
export async function listMarketplaceGigs(): Promise<
  | {
      ok: true;
      gigs: MarketplaceGig[];
      clusters: CombinedBountyTripCard[];
      viewerRoute: TravelRoute | null;
    }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: requests, error } = await supabase
    .from("delivery_requests")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) return { ok: false, error: error.message };

  const openRequests = (requests ?? []) as DeliveryRequest[];
  const clusters = buildCombinedBountyCards(openRequests, {
    windowHours: 2,
    minClusterSize: 2,
  });

  let viewerRoute: TravelRoute | null = null;
  if (user) {
    const { data: routes } = await supabase
      .from("travel_routes")
      .select("*")
      .eq("traveler_id", user.id)
      .in("status", ["scheduled", "active"])
      .gte("departure_time", new Date(Date.now() - 3600_000).toISOString())
      .order("departure_time", { ascending: true })
      .limit(1);
    viewerRoute = (routes?.[0] as TravelRoute | undefined) ?? null;
  }

  const gigs: MarketplaceGig[] = [];

  for (const request of openRequests) {
    const shop = pointOrNull(request.shop_geom);
    const dropoff = pointOrNull(request.dropoff_geom);
    if (!shop || !dropoff) continue;

    let detourMins = 0;
    let detourKm = 0;
    let matchedRouteId: string | null = null;

    if (viewerRoute) {
      try {
        const origin = toLatLng(viewerRoute.origin_geom);
        const destination = toLatLng(viewerRoute.destination_geom);
        const penalty = await calculateDeviationPenalty(
          { origin, destination },
          shop,
          dropoff,
        );
        detourKm = penalty.extraKm;
        detourMins = penalty.extraMins;
        matchedRouteId = viewerRoute.id;
      } catch {
        const approx = (haversineMeters(shop, dropoff) * 0.35) / 1000;
        detourKm = approx;
        detourMins = approx * 2;
      }
    } else {
      const approx = (haversineMeters(shop, dropoff) * 0.35) / 1000;
      detourKm = approx;
      detourMins = approx * 2;
    }

    const bounty = calculateDynamicBounty(detourKm, detourMins, {
      neededBy: request.needed_by,
    });

    const roundedMins = Math.max(1, Math.round(detourMins));
    gigs.push({
      request,
      shop,
      dropoff,
      detourLabel: `+${roundedMins} min${roundedMins === 1 ? "" : "s"} detour`,
      detourMins: roundedMins,
      estimatedPayout: Math.max(request.bounty_fee, bounty.bountyFee),
      matchedRouteId,
    });
  }

  gigs.sort((a, b) => a.detourMins - b.detourMins);

  return { ok: true, gigs, clusters, viewerRoute };
}
