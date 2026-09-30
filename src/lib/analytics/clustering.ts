/**
 * Spatial request clustering for RouteRelay.
 *
 * Groups open buyer requests that share:
 *  - the same city market (shop points within `marketRadiusM`)
 *  - the same village destination (drop-offs within `villageRadiusM`)
 *  - a temporal window (`windowHours`, default 2h) on needed_by / created_at
 *
 * Each cluster becomes a Combined Bounty trip card for travelers.
 */

import { calculateDynamicBounty } from "@/lib/analytics/pricing";
import { haversineMeters, type LatLng } from "@/lib/geo/routing";
import type { DeliveryRequest, GeoJsonPoint } from "@/types/database";

export type ClusterableRequest = Pick<
  DeliveryRequest,
  | "id"
  | "buyer_id"
  | "title"
  | "category"
  | "shop_location_name"
  | "shop_geom"
  | "dropoff_geom"
  | "dropoff_name"
  | "item_price"
  | "bounty_fee"
  | "total_escrow"
  | "status"
  | "needed_by"
  | "created_at"
>;

export type ClusteringOptions = {
  /** Max distance between shops to count as same market (meters) */
  marketRadiusM?: number;
  /** Max distance between drop-offs to count as same village (meters) */
  villageRadiusM?: number;
  /** Temporal window for batching (hours) */
  windowHours?: number;
  /** Minimum requests required to emit a trip card */
  minClusterSize?: number;
  /** Reference "now" for windowing / bounty urgency */
  now?: Date;
};

export type CombinedBountyTripCard = {
  clusterId: string;
  requestIds: string[];
  requestCount: number;
  marketLabel: string;
  villageLabel: string;
  marketCentroid: LatLng;
  villageCentroid: LatLng;
  windowStart: string;
  windowEnd: string;
  /** Sum of individual buyer bounties */
  sumIndividualBounties: number;
  /**
   * Traveler-facing combined bounty — sum of individuals with a batch
   * efficiency bonus (shared detour amortized across the cluster).
   */
  combinedBounty: number;
  batchBonus: number;
  totalItemValue: number;
  totalEscrow: number;
  titles: string[];
  /** Approx shared delivery-leg km (market → village centroid) */
  corridorKm: number;
};

const DEFAULTS = {
  marketRadiusM: 1_500,
  villageRadiusM: 2_000,
  windowHours: 2,
  minClusterSize: 2,
} as const;

function geomToLatLng(geom: GeoJsonPoint): LatLng | null {
  if (!geom?.coordinates) return null;
  const [lng, lat] = geom.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function centroid(points: LatLng[]): LatLng {
  const n = points.length || 1;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / n,
    lng: points.reduce((s, p) => s + p.lng, 0) / n,
  };
}

function requestAnchorTime(req: ClusterableRequest): number {
  if (req.needed_by) {
    const t = new Date(req.needed_by).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return new Date(req.created_at).getTime();
}

function withinWindow(
  a: ClusterableRequest,
  b: ClusterableRequest,
  windowMs: number,
): boolean {
  return Math.abs(requestAnchorTime(a) - requestAnchorTime(b)) <= windowMs;
}

function roundInr(value: number): number {
  return Math.round(value * 100) / 100;
}

type Enriched = {
  req: ClusterableRequest;
  shop: LatLng;
  dropoff: LatLng;
};

/**
 * Union-find clustering over shop proximity ∩ dropoff proximity ∩ time window.
 */
export function clusterDeliveryRequests(
  requests: ClusterableRequest[],
  options: ClusteringOptions = {},
): CombinedBountyTripCard[] {
  const marketRadiusM = options.marketRadiusM ?? DEFAULTS.marketRadiusM;
  const villageRadiusM = options.villageRadiusM ?? DEFAULTS.villageRadiusM;
  const windowHours = options.windowHours ?? DEFAULTS.windowHours;
  const minClusterSize = options.minClusterSize ?? DEFAULTS.minClusterSize;
  const now = options.now ?? new Date();
  const windowMs = windowHours * 60 * 60 * 1000;

  const open = requests.filter(
    (r) => r.status === "open" || r.status === "draft",
  );

  const enriched: Enriched[] = [];
  for (const req of open) {
    const shop = geomToLatLng(req.shop_geom);
    const dropoff = geomToLatLng(req.dropoff_geom);
    if (!shop || !dropoff) continue;
    enriched.push({ req, shop, dropoff });
  }

  const n = enriched.length;
  if (n === 0) return [];

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  };
  const unite = (i: number, j: number) => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[b] = a;
  };

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const sameMarket =
        haversineMeters(enriched[i].shop, enriched[j].shop) <= marketRadiusM;
      const sameVillage =
        haversineMeters(enriched[i].dropoff, enriched[j].dropoff) <=
        villageRadiusM;
      const sameWindow = withinWindow(
        enriched[i].req,
        enriched[j].req,
        windowMs,
      );
      if (sameMarket && sameVillage && sameWindow) {
        unite(i, j);
      }
    }
  }

  const groups = new Map<number, Enriched[]>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(enriched[i]);
    groups.set(root, list);
  }

  const cards: CombinedBountyTripCard[] = [];

  for (const members of groups.values()) {
    if (members.length < minClusterSize) continue;

    const shops = members.map((m) => m.shop);
    const drops = members.map((m) => m.dropoff);
    const marketCentroid = centroid(shops);
    const villageCentroid = centroid(drops);
    const times = members.map((m) => requestAnchorTime(m.req)).sort((a, b) => a - b);

    const sumIndividualBounties = roundInr(
      members.reduce((s, m) => s + Number(m.req.bounty_fee), 0),
    );
    const totalItemValue = roundInr(
      members.reduce((s, m) => s + Number(m.req.item_price), 0),
    );
    const totalEscrow = roundInr(
      members.reduce((s, m) => s + Number(m.req.total_escrow), 0),
    );

    const corridorKm =
      haversineMeters(marketCentroid, villageCentroid) / 1000;

    // Batch efficiency: one shared detour priced once, then +15% bonus per extra request
    const sharedDetourKm = corridorKm * 0.2;
    const sharedDetourMins = sharedDetourKm * 2;
    const earliestNeeded = members
      .map((m) => m.req.needed_by)
      .filter(Boolean)
      .sort()[0];
    const sharedBounty = calculateDynamicBounty(
      sharedDetourKm,
      sharedDetourMins,
      { neededBy: earliestNeeded, now },
    ).bountyFee;

    const batchBonus = roundInr(
      Math.max(0, members.length - 1) * sharedBounty * 0.15,
    );
    const combinedFromParts = roundInr(sumIndividualBounties + batchBonus);
    // Floor: never pay less than a single shared-corridor bounty × request count × 0.7
    const combinedBounty = roundInr(
      Math.max(combinedFromParts, sharedBounty * members.length * 0.7),
    );

    const marketLabel =
      majorityLabel(members.map((m) => m.req.shop_location_name)) ||
      "City market";
    const villageLabel =
      majorityLabel(
        members.map((m) => m.req.dropoff_name).filter(Boolean) as string[],
      ) || "Village cluster";

    const requestIds = members.map((m) => m.req.id).sort();
    const clusterId = `batch_${hashIds(requestIds)}`;

    cards.push({
      clusterId,
      requestIds,
      requestCount: members.length,
      marketLabel,
      villageLabel,
      marketCentroid,
      villageCentroid,
      windowStart: new Date(times[0]).toISOString(),
      windowEnd: new Date(times[times.length - 1]).toISOString(),
      sumIndividualBounties,
      combinedBounty,
      batchBonus,
      totalItemValue,
      totalEscrow: roundInr(totalItemValue + combinedBounty),
      titles: members.map((m) => m.req.title),
      corridorKm: roundInr(corridorKm),
    });
  }

  cards.sort((a, b) => b.combinedBounty - a.combinedBounty);
  return cards;
}

function majorityLabel(labels: string[]): string | null {
  if (labels.length === 0) return null;
  const counts = new Map<string, number>();
  for (const label of labels) {
    const key = label.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [label, count] of counts) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}

function hashIds(ids: string[]): string {
  // Stable short id from sorted UUIDs (not cryptographic)
  let h = 0;
  const s = ids.join("|");
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Convenience: build trip cards from raw DeliveryRequest rows.
 */
export function buildCombinedBountyCards(
  requests: DeliveryRequest[],
  options?: ClusteringOptions,
): CombinedBountyTripCard[] {
  return clusterDeliveryRequests(requests, options);
}
