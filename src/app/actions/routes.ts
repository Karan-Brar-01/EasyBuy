"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { toEwktPointFromCoords } from "@/lib/geo/map";
import type { CargoSize, TravelRoute, TripVehicle } from "@/types/database";

export type { TripVehicle };

const VEHICLE_TO_CARGO: Record<TripVehicle, CargoSize> = {
  bike: "small",
  car: "large",
  bus: "xlarge",
};

export type CreateTravelRouteInput = {
  originName: string;
  destinationName: string;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  departureTime: string;
  tripVehicle: TripVehicle;
  maxDetourMeters?: number;
  notes?: string;
};

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function createTravelRoute(
  input: CreateTravelRouteInput,
): Promise<ActionResult<TravelRoute>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Sign in as a traveler to publish a trip" };
  }

  if (!input.originName.trim() || !input.destinationName.trim()) {
    return { ok: false, error: "Origin and destination names are required" };
  }
  if (!input.departureTime) {
    return { ok: false, error: "Departure time is required" };
  }
  if (!["bike", "car", "bus"].includes(input.tripVehicle)) {
    return { ok: false, error: "Choose Bike, Car, or Bus" };
  }

  const { data, error } = await supabase
    .from("travel_routes")
    .insert({
      traveler_id: user.id,
      origin_name: input.originName.trim(),
      destination_name: input.destinationName.trim(),
      origin_geom: toEwktPointFromCoords(input.originLat, input.originLng),
      destination_geom: toEwktPointFromCoords(
        input.destinationLat,
        input.destinationLng,
      ),
      departure_time: new Date(input.departureTime).toISOString(),
      trip_vehicle: input.tripVehicle,
      max_cargo_size: VEHICLE_TO_CARGO[input.tripVehicle],
      max_detour_meters: input.maxDetourMeters ?? 5000,
      notes: input.notes?.trim() || null,
      status: "scheduled",
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase
    .from("profiles")
    .update({
      vehicle_type:
        input.tripVehicle === "bike"
          ? "motorcycle"
          : input.tripVehicle === "car"
            ? "car"
            : "van",
    })
    .eq("id", user.id);

  revalidatePath("/marketplace");
  revalidatePath("/routes/new");
  return { ok: true, data };
}
