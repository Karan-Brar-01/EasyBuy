/**
 * Admin telemetry metrics for RouteRelay logistics.
 *
 * Compares commuter detour overhead to dedicated courier transit,
 * estimates avoided carbon/fuel, and tracks escrow health.
 */

import { haversineMeters, toLatLng, type LatLng } from "@/lib/geo/routing";
import type {
  DeliveryRequest,
  EscrowStatus,
  Order,
  TravelRoute,
} from "@/types/database";

/** Dedicated courier: motorcycle van fleet assumptions (India peri-urban). */
export const COURIER_ASSUMPTIONS = {
  /** Average courier speed including stops (km/h) */
  avgSpeedKmh: 22,
  /** Fixed pickup / dispatch overhead (minutes) */
  dispatchOverheadMins: 18,
  /** CO₂ intensity for dedicated courier trip (g/km) */
  co2GramsPerKm: 145,
  /** Petrol equivalent (liters/km) for courier two-wheeler */
  fuelLitersPerKm: 0.035,
} as const;

/** Incremental emissions only on the extra detour km a commuter drives. */
export const COMMUTER_INCREMENTAL = {
  co2GramsPerKm: 120,
  fuelLitersPerKm: 0.03,
} as const;

export type TelemetryOrderRow = Order & {
  request?: DeliveryRequest | null;
  route?: TravelRoute | null;
};

export type DeviationComparison = {
  sampleSize: number;
  avgCommuterDeviationMins: number;
  avgCourierTransitMins: number;
  avgTimeSavedMins: number;
  /** How much faster (or slower) vs courier — positive = saved */
  savingsRatio: number;
};

export type EmissionsSaved = {
  sampleSize: number;
  courierKmAvoided: number;
  detourKmDriven: number;
  netKmAvoided: number;
  co2KgSaved: number;
  fuelLitersSaved: number;
};

export type EscrowHealth = {
  totalOrders: number;
  disputedOrders: number;
  disputeRate: number;
  completedOrders: number;
  /** Average hours from claimed_at → completed_at */
  avgFulfillmentLatencyHours: number | null;
  medianFulfillmentLatencyHours: number | null;
};

export type AnalyticsTelemetry = {
  generatedAt: string;
  deviation: DeviationComparison;
  emissions: EmissionsSaved;
  escrow: EscrowHealth;
  openRequestCount: number;
  activeRouteCount: number;
  batchClusterCount: number;
};

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function safePoint(
  geom: DeliveryRequest["shop_geom"] | TravelRoute["origin_geom"] | null | undefined,
): LatLng | null {
  try {
    if (!geom) return null;
    return toLatLng(geom);
  } catch {
    return null;
  }
}

function courierTransitMins(shop: LatLng, dropoff: LatLng): number {
  const km = haversineMeters(shop, dropoff) / 1000;
  const driveMins = (km / COURIER_ASSUMPTIONS.avgSpeedKmh) * 60;
  return driveMins + COURIER_ASSUMPTIONS.dispatchOverheadMins;
}

/**
 * Approximate commuter deviation minutes for an order with route + request.
 * Uses geodesic detour: (O→shop→drop→D) − (O→D).
 */
export function estimateCommuterDeviationMins(
  route: TravelRoute,
  request: DeliveryRequest,
): number | null {
  const origin = safePoint(route.origin_geom);
  const dest = safePoint(route.destination_geom);
  const shop = safePoint(request.shop_geom);
  const dropoff = safePoint(request.dropoff_geom);
  if (!origin || !dest || !shop || !dropoff) return null;

  const baseline = haversineMeters(origin, dest);
  const via =
    haversineMeters(origin, shop) +
    haversineMeters(shop, dropoff) +
    haversineMeters(dropoff, dest);
  const extraM = Math.max(0, via - baseline);
  const extraKm = extraM / 1000;
  // ~2 min per detour km at peri-urban speeds
  return extraKm * 2;
}

export function computeDeviationComparison(
  rows: TelemetryOrderRow[],
): DeviationComparison {
  const samples: { commuter: number; courier: number }[] = [];

  for (const row of rows) {
    if (!row.request || !row.route) continue;
    const shop = safePoint(row.request.shop_geom);
    const dropoff = safePoint(row.request.dropoff_geom);
    if (!shop || !dropoff) continue;

    const commuter = estimateCommuterDeviationMins(row.route, row.request);
    if (commuter == null) continue;

    samples.push({
      commuter,
      courier: courierTransitMins(shop, dropoff),
    });
  }

  if (samples.length === 0) {
    return {
      sampleSize: 0,
      avgCommuterDeviationMins: 0,
      avgCourierTransitMins: 0,
      avgTimeSavedMins: 0,
      savingsRatio: 0,
    };
  }

  const avgCommuter =
    samples.reduce((s, x) => s + x.commuter, 0) / samples.length;
  const avgCourier =
    samples.reduce((s, x) => s + x.courier, 0) / samples.length;
  const avgSaved = avgCourier - avgCommuter;

  return {
    sampleSize: samples.length,
    avgCommuterDeviationMins: round(avgCommuter, 1),
    avgCourierTransitMins: round(avgCourier, 1),
    avgTimeSavedMins: round(avgSaved, 1),
    savingsRatio: avgCourier > 0 ? round(avgSaved / avgCourier, 3) : 0,
  };
}

export function computeEmissionsSaved(
  rows: TelemetryOrderRow[],
): EmissionsSaved {
  let courierKm = 0;
  let detourKm = 0;
  let n = 0;

  for (const row of rows) {
    if (!row.request) continue;
    const shop = safePoint(row.request.shop_geom);
    const dropoff = safePoint(row.request.dropoff_geom);
    if (!shop || !dropoff) continue;

    const tripKm = haversineMeters(shop, dropoff) / 1000;
    courierKm += tripKm;

    if (row.route) {
      const mins = estimateCommuterDeviationMins(row.route, row.request);
      detourKm += mins != null ? mins / 2 : tripKm * 0.2;
    } else {
      // Unmatched / open: assume typical 20% corridor detour if fulfilled by commute
      detourKm += tripKm * 0.2;
    }
    n += 1;
  }

  const courierCo2 =
    courierKm * COURIER_ASSUMPTIONS.co2GramsPerKm;
  const detourCo2 = detourKm * COMMUTER_INCREMENTAL.co2GramsPerKm;
  const courierFuel =
    courierKm * COURIER_ASSUMPTIONS.fuelLitersPerKm;
  const detourFuel = detourKm * COMMUTER_INCREMENTAL.fuelLitersPerKm;

  return {
    sampleSize: n,
    courierKmAvoided: round(courierKm),
    detourKmDriven: round(detourKm),
    netKmAvoided: round(Math.max(0, courierKm - detourKm)),
    co2KgSaved: round(Math.max(0, courierCo2 - detourCo2) / 1000, 3),
    fuelLitersSaved: round(Math.max(0, courierFuel - detourFuel), 3),
  };
}

const DISPUTED: EscrowStatus[] = ["disputed"];
const COMPLETED: EscrowStatus[] = [
  "released_to_traveler",
  "completed",
];

export function computeEscrowHealth(orders: Order[]): EscrowHealth {
  const totalOrders = orders.length;
  const disputedOrders = orders.filter((o) =>
    DISPUTED.includes(o.escrow_status),
  ).length;
  const completed = orders.filter((o) =>
    COMPLETED.includes(o.escrow_status),
  );

  const latenciesHours: number[] = [];
  for (const o of completed) {
    if (!o.claimed_at || !o.completed_at) continue;
    const start = new Date(o.claimed_at).getTime();
    const end = new Date(o.completed_at).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) continue;
    latenciesHours.push((end - start) / (1000 * 60 * 60));
  }

  const avg =
    latenciesHours.length > 0
      ? latenciesHours.reduce((s, x) => s + x, 0) / latenciesHours.length
      : null;
  const med = median(latenciesHours);

  return {
    totalOrders,
    disputedOrders,
    disputeRate: totalOrders > 0 ? round(disputedOrders / totalOrders, 4) : 0,
    completedOrders: completed.length,
    avgFulfillmentLatencyHours: avg != null ? round(avg, 2) : null,
    medianFulfillmentLatencyHours: med != null ? round(med, 2) : null,
  };
}

export function buildAnalyticsTelemetry(input: {
  orders: TelemetryOrderRow[];
  openRequestCount: number;
  activeRouteCount: number;
  batchClusterCount: number;
  now?: Date;
}): AnalyticsTelemetry {
  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    deviation: computeDeviationComparison(input.orders),
    emissions: computeEmissionsSaved(input.orders),
    escrow: computeEscrowHealth(input.orders),
    openRequestCount: input.openRequestCount,
    activeRouteCount: input.activeRouteCount,
    batchClusterCount: input.batchClusterCount,
  };
}
