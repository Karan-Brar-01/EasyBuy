"use server";

import {
  buildCombinedBountyCards,
  type CombinedBountyTripCard,
} from "@/lib/analytics/clustering";
import {
  buildAnalyticsTelemetry,
  type AnalyticsTelemetry,
  type TelemetryOrderRow,
} from "@/lib/analytics/telemetry";
import { createClient } from "@/lib/supabase/server";
import type { DeliveryRequest, Order, TravelRoute } from "@/types/database";

export type AnalyticsDashboardData = {
  telemetry: AnalyticsTelemetry;
  clusters: CombinedBountyTripCard[];
};

export async function getAnalyticsDashboard(): Promise<
  | { ok: true; data: AnalyticsDashboardData }
  | { ok: false; error: string }
> {
  const supabase = await createClient();

  const [
    ordersRes,
    requestsRes,
    routesRes,
    openCountRes,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("delivery_requests")
      .select("*")
      .in("status", ["open", "matched", "in_transit", "completed"])
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("travel_routes")
      .select("*")
      .in("status", ["scheduled", "active", "completed"])
      .limit(500),
    supabase
      .from("delivery_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
  ]);

  if (ordersRes.error) return { ok: false, error: ordersRes.error.message };
  if (requestsRes.error) return { ok: false, error: requestsRes.error.message };
  if (routesRes.error) return { ok: false, error: routesRes.error.message };

  const orders = (ordersRes.data ?? []) as Order[];
  const requests = (requestsRes.data ?? []) as DeliveryRequest[];
  const routes = (routesRes.data ?? []) as TravelRoute[];

  const requestById = new Map(requests.map((r) => [r.id, r]));
  const routeById = new Map(routes.map((r) => [r.id, r]));

  const telemetryRows: TelemetryOrderRow[] = orders.map((order) => ({
    ...order,
    request: requestById.get(order.request_id) ?? null,
    route: order.route_id ? routeById.get(order.route_id) ?? null : null,
  }));

  // Also include open requests (not yet ordered) for emissions opportunity
  const orderedRequestIds = new Set(orders.map((o) => o.request_id));
  for (const req of requests) {
    if (req.status !== "open" || orderedRequestIds.has(req.id)) continue;
    telemetryRows.push({
      id: `virtual_${req.id}`,
      request_id: req.id,
      traveler_id: null,
      route_id: null,
      escrow_status: "funded_escrow",
      payment_reference: null,
      version: 1,
      funded_at: req.created_at,
      created_at: req.created_at,
      claimed_at: null,
      completed_at: null,
      updated_at: req.updated_at,
      request: req,
      route: null,
    });
  }

  const openRequests = requests.filter((r) => r.status === "open");
  const clusters = buildCombinedBountyCards(openRequests, {
    windowHours: 2,
    minClusterSize: 2,
  });

  const activeRouteCount = routes.filter((r) =>
    r.status === "scheduled" || r.status === "active",
  ).length;

  const telemetry = buildAnalyticsTelemetry({
    orders: telemetryRows,
    openRequestCount: openCountRes.count ?? openRequests.length,
    activeRouteCount,
    batchClusterCount: clusters.length,
  });

  return {
    ok: true,
    data: { telemetry, clusters },
  };
}

export async function listCombinedBountyCards(): Promise<
  | { ok: true; clusters: CombinedBountyTripCard[] }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_requests")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { ok: false, error: error.message };

  const clusters = buildCombinedBountyCards((data ?? []) as DeliveryRequest[], {
    windowHours: 2,
    minClusterSize: 2,
  });

  return { ok: true, clusters };
}
