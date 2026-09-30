/**
 * Geospatial primitives and OpenRouteService (ORS) routing helpers.
 */

export type LatLng = {
  /** WGS84 latitude */
  lat: number;
  /** WGS84 longitude */
  lng: number;
};

export type RouteGeometry = {
  type: "LineString";
  /** [longitude, latitude] pairs (GeoJSON order) */
  coordinates: [number, number][];
};

export type RouteResult = {
  geometry: RouteGeometry;
  /** Total path length in kilometers */
  distanceKm: number;
  /** Estimated travel time in minutes */
  durationMins: number;
  /** Raw meters / seconds from the provider */
  distanceMeters: number;
  durationSeconds: number;
  provider: "openrouteservice" | "haversine_fallback";
};

export type CommuterRouteEndpoints = {
  origin: LatLng;
  destination: LatLng;
};

export type DeviationPenalty = {
  baseline: RouteResult;
  withDetour: RouteResult;
  /** Extra kilometers vs baseline trip */
  extraKm: number;
  /** Extra minutes vs baseline trip */
  extraMins: number;
  /** Extra meters (for detour caps) */
  extraMeters: number;
};

const ORS_DIRECTIONS_URL =
  "https://api.openrouteservice.org/v2/directions/driving-car/geojson";

const EARTH_RADIUS_M = 6_371_000;
/** Rough urban driving speed used when ORS is unavailable */
const FALLBACK_SPEED_M_PER_S = 8.33; // ~30 km/h

function assertLatLng(point: LatLng, label: string): void {
  if (
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    point.lat < -90 ||
    point.lat > 90 ||
    point.lng < -180 ||
    point.lng > 180
  ) {
    throw new Error(`Invalid coordinates for ${label}`);
  }
}

/** Convert GeoJSON Point ([lng, lat]) or LatLng into LatLng. */
export function toLatLng(
  input: LatLng | { type: "Point"; coordinates: [number, number] },
): LatLng {
  if ("coordinates" in input) {
    const [lng, lat] = input.coordinates;
    return { lat, lng };
  }
  return input;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function straightLineRoute(points: LatLng[]): RouteResult {
  if (points.length < 2) {
    throw new Error("At least two points are required to build a route");
  }

  let distanceMeters = 0;
  for (let i = 1; i < points.length; i += 1) {
    distanceMeters += haversineMeters(points[i - 1], points[i]);
  }

  const durationSeconds = distanceMeters / FALLBACK_SPEED_M_PER_S;
  const coordinates = points.map(
    (p) => [p.lng, p.lat] as [number, number],
  );

  return {
    geometry: { type: "LineString", coordinates },
    distanceKm: distanceMeters / 1000,
    durationMins: durationSeconds / 60,
    distanceMeters,
    durationSeconds,
    provider: "haversine_fallback",
  };
}

type OrsGeoJsonResponse = {
  features?: Array<{
    geometry?: {
      type?: string;
      coordinates?: [number, number][];
    };
    properties?: {
      summary?: {
        distance?: number;
        duration?: number;
      };
    };
  }>;
  error?: { message?: string; code?: number };
};

async function fetchOrsRoute(waypoints: LatLng[]): Promise<RouteResult> {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    return straightLineRoute(waypoints);
  }

  const coordinates = waypoints.map((p) => [p.lng, p.lat]);

  const response = await fetch(ORS_DIRECTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
      Accept: "application/json, application/geo+json",
    },
    body: JSON.stringify({
      coordinates,
      instructions: false,
      elevation: false,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OpenRouteService directions failed (${response.status}): ${body.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as OrsGeoJsonResponse;
  const feature = data.features?.[0];
  const summary = feature?.properties?.summary;
  const geometryCoords = feature?.geometry?.coordinates;

  if (
    !feature ||
    !summary ||
    summary.distance == null ||
    summary.duration == null ||
    !geometryCoords?.length
  ) {
    throw new Error("OpenRouteService returned an empty or invalid route");
  }

  return {
    geometry: {
      type: "LineString",
      coordinates: geometryCoords,
    },
    distanceKm: summary.distance / 1000,
    durationMins: summary.duration / 60,
    distanceMeters: summary.distance,
    durationSeconds: summary.duration,
    provider: "openrouteservice",
  };
}

/**
 * Calculate a driving route between two points via OpenRouteService.
 * Falls back to geodesic estimate when `ORS_API_KEY` is unset (local/dev).
 */
export async function calculateRoute(
  origin: LatLng,
  destination: LatLng,
): Promise<RouteResult> {
  assertLatLng(origin, "origin");
  assertLatLng(destination, "destination");
  return fetchOrsRoute([origin, destination]);
}

/**
 * Extra distance/time a commuter incurs by servicing pickup then dropoff
 * on top of their baseline origin → destination trip.
 *
 * Detour path: origin → pickup → dropoff → destination
 */
export async function calculateDeviationPenalty(
  commuterRoute: CommuterRouteEndpoints,
  pickupPoint: LatLng,
  dropoffPoint: LatLng,
): Promise<DeviationPenalty> {
  assertLatLng(commuterRoute.origin, "commuter origin");
  assertLatLng(commuterRoute.destination, "commuter destination");
  assertLatLng(pickupPoint, "pickup");
  assertLatLng(dropoffPoint, "dropoff");

  const [baseline, withDetour] = await Promise.all([
    fetchOrsRoute([commuterRoute.origin, commuterRoute.destination]),
    fetchOrsRoute([
      commuterRoute.origin,
      pickupPoint,
      dropoffPoint,
      commuterRoute.destination,
    ]),
  ]);

  const extraMeters = Math.max(
    0,
    withDetour.distanceMeters - baseline.distanceMeters,
  );
  const extraSeconds = Math.max(
    0,
    withDetour.durationSeconds - baseline.durationSeconds,
  );

  return {
    baseline,
    withDetour,
    extraKm: extraMeters / 1000,
    extraMins: extraSeconds / 60,
    extraMeters,
  };
}
