"use server";

import { revalidatePath } from "next/cache";

import {
  calculateDynamicBounty,
  type BountyBreakdown,
} from "@/lib/analytics/pricing";
import { haversineMeters, type LatLng } from "@/lib/geo/routing";
import { toEwktPointFromCoords } from "@/lib/geo/map";
import { createClient } from "@/lib/supabase/server";
import type { DeliveryRequest, ItemCategory, Order } from "@/types/database";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type PreviewBountyInput = {
  shopLat: number;
  shopLng: number;
  dropoffLat: number;
  dropoffLng: number;
  neededBy?: string | null;
};

/**
 * Preview bounty before a traveler is matched.
 * Uses ~35% of shop→dropoff geodesic as expected detour + ~2 min/km.
 */
export async function previewDynamicBounty(
  input: PreviewBountyInput,
): Promise<ActionResult<{ breakdown: BountyBreakdown; estimateKm: number; estimateMins: number }>> {
  const shop: LatLng = { lat: input.shopLat, lng: input.shopLng };
  const dropoff: LatLng = { lat: input.dropoffLat, lng: input.dropoffLng };
  const legMeters = haversineMeters(shop, dropoff);
  const estimateKm = (legMeters * 0.35) / 1000;
  const estimateMins = estimateKm * 2;
  const breakdown = calculateDynamicBounty(estimateKm, estimateMins, {
    neededBy: input.neededBy,
  });
  return { ok: true, data: { breakdown, estimateKm, estimateMins } };
}

export type CreateDeliveryRequestInput = {
  title: string;
  category: ItemCategory;
  description?: string;
  shopLocationName: string;
  dropoffName?: string;
  shopLat: number;
  shopLng: number;
  dropoffLat: number;
  dropoffLng: number;
  itemPrice: number;
  bountyFee: number;
  neededBy?: string | null;
};

export async function createDeliveryRequest(
  input: CreateDeliveryRequestInput,
): Promise<ActionResult<{ request: DeliveryRequest; order: Order }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Sign in as a buyer to post a request" };
  }

  if (!input.title.trim() || !input.shopLocationName.trim()) {
    return { ok: false, error: "Title and shop location are required" };
  }
  if (input.itemPrice < 0 || input.bountyFee < 0) {
    return { ok: false, error: "Prices must be non-negative" };
  }

  const totalEscrow =
    Math.round((input.itemPrice + input.bountyFee) * 100) / 100;

  if (
    !Number.isFinite(input.shopLat) ||
    !Number.isFinite(input.shopLng) ||
    !Number.isFinite(input.dropoffLat) ||
    !Number.isFinite(input.dropoffLng)
  ) {
    return {
      ok: false,
      error: "Set shop and drop-off pins on the map before posting",
    };
  }

  const { data: request, error: requestError } = await supabase
    .from("delivery_requests")
    .insert({
      buyer_id: user.id,
      title: input.title.trim(),
      category: input.category,
      description: input.description?.trim() || null,
      shop_location_name: input.shopLocationName.trim(),
      dropoff_name: input.dropoffName?.trim() || null,
      shop_geom: toEwktPointFromCoords(input.shopLat, input.shopLng),
      dropoff_geom: toEwktPointFromCoords(input.dropoffLat, input.dropoffLng),
      item_price: input.itemPrice,
      bounty_fee: input.bountyFee,
      total_escrow: totalEscrow,
      status: "open",
      needed_by: input.neededBy
        ? new Date(input.neededBy).toISOString()
        : null,
    })
    .select("*")
    .single();

  if (requestError) return { ok: false, error: requestError.message };

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      request_id: request.id,
      escrow_status: "funded_escrow",
      funded_at: new Date().toISOString(),
      version: 1,
    })
    .select("*")
    .single();

  if (orderError) {
    return {
      ok: false,
      error: `Request saved but order failed: ${orderError.message}`,
    };
  }

  revalidatePath("/marketplace");
  return { ok: true, data: { request, order } };
}
