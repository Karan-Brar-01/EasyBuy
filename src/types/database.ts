/**
 * RouteRelay database types aligned with supabase/migrations
 */

export type UserRole = "buyer" | "traveler" | "both";

export type VehicleType =
  | "none"
  | "bicycle"
  | "motorcycle"
  | "scooter"
  | "car"
  | "van"
  | "other";

export type RouteStatus = "scheduled" | "active" | "completed" | "cancelled";

export type CargoSize = "small" | "medium" | "large" | "xlarge";

export type RequestStatus =
  | "draft"
  | "open"
  | "matched"
  | "in_transit"
  | "delivered"
  | "completed"
  | "cancelled"
  | "expired";

export type EscrowStatus =
  | "draft"
  | "funded_escrow"
  | "claimed"
  | "in_transit"
  | "delivered_pending_verification"
  | "released_to_traveler"
  | "completed"
  | "disputed"
  | "refunded"
  | "cancelled";

export type ItemCategory =
  | "groceries"
  | "pharmacy"
  | "electronics"
  | "clothing"
  | "documents"
  | "other";

export type TransactionDirection = "debit" | "credit";

/** GeoJSON-ish point as returned by PostgREST for geography columns */
export type GeoJsonPoint = {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
};

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  trust_score: number;
  vehicle_type: VehicleType;
  avatar_url: string | null;
  completed_trips: number;
  created_at: string;
  updated_at: string;
};

export type TripVehicle = "bike" | "car" | "bus";

export type TravelRoute = {
  id: string;
  traveler_id: string;
  origin_name: string;
  origin_geom: GeoJsonPoint;
  destination_name: string;
  destination_geom: GeoJsonPoint;
  departure_time: string;
  max_cargo_size: CargoSize;
  trip_vehicle: TripVehicle;
  status: RouteStatus;
  max_detour_meters: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DeliveryRequest = {
  id: string;
  buyer_id: string;
  title: string;
  category: ItemCategory;
  description: string | null;
  shop_location_name: string;
  shop_geom: GeoJsonPoint;
  dropoff_geom: GeoJsonPoint;
  dropoff_name: string | null;
  item_price: number;
  bounty_fee: number;
  total_escrow: number;
  status: RequestStatus;
  qr_secret: string | null;
  needed_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Active marketplace listing (excludes qr_secret) */
export type OpenGig = Omit<DeliveryRequest, "qr_secret">;

export type Order = {
  id: string;
  request_id: string;
  traveler_id: string | null;
  route_id: string | null;
  escrow_status: EscrowStatus;
  payment_reference: string | null;
  version: number;
  funded_at: string | null;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type Transaction = {
  id: string;
  order_id: string;
  request_id: string;
  traveler_id: string | null;
  escrow_status: EscrowStatus;
  payment_reference: string | null;
  amount: number;
  direction: TransactionDirection;
  note: string | null;
  created_at: string;
  completed_at: string | null;
};

export type HandshakeChallenge = {
  id: string;
  order_id: string;
  traveler_id: string;
  nonce: string;
  numeric_token: string;
  signature_hash: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

export type EscrowEvent = {
  id: string;
  order_id: string;
  from_status: EscrowStatus | null;
  to_status: EscrowStatus;
  actor_id: string | null;
  reason: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type ProfileInsert = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  role?: UserRole;
  trust_score?: number;
  vehicle_type?: VehicleType;
  avatar_url?: string | null;
  completed_trips?: number;
};

export type TravelRouteInsert = {
  traveler_id: string;
  origin_name: string;
  origin_geom: string | GeoJsonPoint;
  destination_name: string;
  destination_geom: string | GeoJsonPoint;
  departure_time: string;
  max_cargo_size?: CargoSize;
  trip_vehicle?: TripVehicle;
  status?: RouteStatus;
  max_detour_meters?: number;
  notes?: string | null;
};

export type DeliveryRequestInsert = {
  buyer_id: string;
  title: string;
  category?: ItemCategory;
  description?: string | null;
  shop_location_name: string;
  shop_geom: string | GeoJsonPoint;
  dropoff_geom: string | GeoJsonPoint;
  dropoff_name?: string | null;
  item_price: number;
  bounty_fee: number;
  total_escrow: number;
  status?: RequestStatus;
  qr_secret?: string | null;
  needed_by?: string | null;
};

export type OrderInsert = {
  request_id: string;
  traveler_id?: string | null;
  route_id?: string | null;
  escrow_status?: EscrowStatus;
  payment_reference?: string | null;
  version?: number;
  funded_at?: string | null;
  claimed_at?: string | null;
  completed_at?: string | null;
};

export type TransactionInsert = {
  order_id: string;
  request_id: string;
  traveler_id?: string | null;
  escrow_status: EscrowStatus;
  payment_reference?: string | null;
  amount: number;
  direction: TransactionDirection;
  note?: string | null;
  completed_at?: string | null;
};

type TableDef<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type FindRoutesInCorridorArgs = {
  p_shop_lng: number;
  p_shop_lat: number;
  p_dropoff_lng: number;
  p_dropoff_lat: number;
  p_corridor_meters?: number;
  p_limit?: number;
};

export type FindRoutesInCorridorRow = {
  route_id: string;
  traveler_id: string;
  origin_name: string;
  destination_name: string;
  origin_lng: number;
  origin_lat: number;
  destination_lng: number;
  destination_lat: number;
  departure_time: string;
  max_cargo_size: CargoSize;
  max_detour_meters: number;
  status: RouteStatus;
  traveler_full_name: string | null;
  trust_score: number;
  approx_baseline_m: number;
  approx_via_m: number;
  approx_extra_m: number;
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<Profile, ProfileInsert, Partial<ProfileInsert>>;
      travel_routes: TableDef<
        TravelRoute,
        TravelRouteInsert,
        Partial<TravelRouteInsert>
      >;
      delivery_requests: TableDef<
        DeliveryRequest,
        DeliveryRequestInsert,
        Partial<DeliveryRequestInsert>
      >;
      orders: TableDef<Order, OrderInsert, Partial<OrderInsert>>;
      transactions: TableDef<
        Transaction,
        TransactionInsert,
        Partial<TransactionInsert>
      >;
      handshake_challenges: TableDef<
        HandshakeChallenge,
        Omit<HandshakeChallenge, "id" | "created_at" | "consumed_at"> & {
          id?: string;
          consumed_at?: string | null;
          created_at?: string;
        },
        Partial<HandshakeChallenge>
      >;
      escrow_events: TableDef<
        EscrowEvent,
        Omit<EscrowEvent, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        },
        Partial<EscrowEvent>
      >;
    };
    Views: {
      open_gigs: {
        Row: OpenGig;
        Relationships: [];
      };
    };
    Functions: {
      find_routes_in_corridor: {
        Args: FindRoutesInCorridorArgs;
        Returns: FindRoutesInCorridorRow[];
      };
      transition_order_escrow: {
        Args: {
          p_order_id: string;
          p_to_status: EscrowStatus;
          p_expected_version: number;
          p_route_id?: string | null;
          p_reason?: string | null;
        };
        Returns: Order;
      };
      register_handshake_challenge: {
        Args: {
          p_order_id: string;
          p_nonce: string;
          p_numeric_token: string;
          p_signature_hash: string;
          p_expires_at: string;
        };
        Returns: HandshakeChallenge;
      };
      verify_and_release_escrow: {
        Args: {
          p_order_id: string;
          p_signature_hash: string;
          p_expected_version: number;
        };
        Returns: Order;
      };
    };
    Enums: {
      user_role: UserRole;
      vehicle_type: VehicleType;
      route_status: RouteStatus;
      cargo_size: CargoSize;
      request_status: RequestStatus;
      escrow_status: EscrowStatus;
      item_category: ItemCategory;
      trip_vehicle: TripVehicle;
    };
    CompositeTypes: Record<string, never>;
  };
};
