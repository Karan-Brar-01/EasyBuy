"use server";

import { geoJsonToLatLng } from "@/lib/geo/map";
import { createClient } from "@/lib/supabase/server";
import type {
  DeliveryRequest,
  Order,
  TravelRoute,
} from "@/types/database";
import type { LatLng } from "@/lib/geo/routing";

export type OrderDetail = {
  order: Order;
  request: DeliveryRequest;
  route: TravelRoute | null;
  role: "buyer" | "traveler" | "observer";
  markers: { id: string; position: LatLng; label: string }[];
  routeLine: LatLng[];
};

export async function getOrderDetail(
  orderId: string,
): Promise<{ ok: true; data: OrderDetail } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) return { ok: false, error: orderError.message };
  if (!order) return { ok: false, error: "Order not found" };

  const { data: request, error: requestError } = await supabase
    .from("delivery_requests")
    .select("*")
    .eq("id", order.request_id)
    .maybeSingle();

  if (requestError) return { ok: false, error: requestError.message };
  if (!request) return { ok: false, error: "Delivery request not found" };

  let route: TravelRoute | null = null;
  if (order.route_id) {
    const { data } = await supabase
      .from("travel_routes")
      .select("*")
      .eq("id", order.route_id)
      .maybeSingle();
    route = data;
  }

  let role: OrderDetail["role"] = "observer";
  if (user?.id && user.id === request.buyer_id) role = "buyer";
  else if (user?.id && user.id === order.traveler_id) role = "traveler";

  const shop = geoJsonToLatLng(request.shop_geom);
  const dropoff = geoJsonToLatLng(request.dropoff_geom);
  const origin = route ? geoJsonToLatLng(route.origin_geom) : null;
  const dest = route ? geoJsonToLatLng(route.destination_geom) : null;

  const markers: OrderDetail["markers"] = [];
  if (origin) markers.push({ id: "origin", position: origin, label: "Origin" });
  if (shop)
    markers.push({
      id: "shop",
      position: shop,
      label: request.shop_location_name,
    });
  if (dropoff)
    markers.push({
      id: "dropoff",
      position: dropoff,
      label: request.dropoff_name ?? "Drop-off",
    });
  if (dest)
    markers.push({ id: "dest", position: dest, label: "Destination" });

  const routeLine: LatLng[] = [];
  if (origin) routeLine.push(origin);
  if (shop) routeLine.push(shop);
  if (dropoff) routeLine.push(dropoff);
  if (dest) routeLine.push(dest);
  if (routeLine.length < 2 && shop && dropoff) {
    routeLine.push(shop, dropoff);
  }

  return {
    ok: true,
    data: { order, request, route, role, markers, routeLine },
  };
}
