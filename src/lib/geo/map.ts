import type { LatLngExpression } from "leaflet";

import type { GeoJsonPoint } from "@/types/database";
import type { LatLng } from "@/lib/geo/routing";

/** Default map center — Chandigarh / Punjab corridor */
export const DEFAULT_MAP_CENTER: LatLng = { lat: 30.7333, lng: 76.7794 };
export const DEFAULT_MAP_ZOOM = 11;

export function geoJsonToLatLng(point: GeoJsonPoint | null | undefined): LatLng | null {
  if (!point?.coordinates) return null;
  const [lng, lat] = point.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function toLeafletLatLng(point: LatLng): LatLngExpression {
  return [point.lat, point.lng];
}

export function toGeoJsonPoint(point: LatLng): GeoJsonPoint {
  return { type: "Point", coordinates: [point.lng, point.lat] };
}

/**
 * EWKT for PostgREST/Supabase inserts into geography/geometry columns.
 * GeoJSON objects are rejected with "parse error - invalid geometry".
 */
export function toEwktPoint(point: LatLng): string {
  return `SRID=4326;POINT(${point.lng} ${point.lat})`;
}

export function toEwktPointFromCoords(lat: number, lng: number): string {
  return toEwktPoint({ lat, lng });
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDetourMins(mins: number): string {
  const rounded = Math.max(1, Math.round(mins));
  return `+${rounded} min${rounded === 1 ? "" : "s"} detour`;
}
