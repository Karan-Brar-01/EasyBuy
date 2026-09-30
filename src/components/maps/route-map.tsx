"use client";

import { useEffect, useId, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  toLeafletLatLng,
} from "@/lib/geo/map";
import type { LatLng } from "@/lib/geo/routing";
import { cn } from "@/lib/utils";

const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

function MapLifecycle({
  points,
  center,
}: {
  points: LatLng[];
  center: LatLng;
}) {
  const map = useMap();

  useEffect(() => {
    const el = map.getContainer();
    const resize = () => {
      map.invalidateSize({ animate: false });
    };

    resize();
    const timeouts = [50, 150, 400, 1000].map((ms) =>
      window.setTimeout(resize, ms),
    );

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => resize())
        : null;
    ro?.observe(el);
    window.addEventListener("resize", resize);

    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
      ro?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [map]);

  useEffect(() => {
    if (points.length === 0) {
      map.setView(toLeafletLatLng(center), map.getZoom());
      return;
    }
    if (points.length === 1) {
      map.setView(toLeafletLatLng(points[0]), 13);
      return;
    }
    map.fitBounds(L.latLngBounds(points.map(toLeafletLatLng)).pad(0.2));
    map.invalidateSize({ animate: false });
  }, [map, points, center]);

  return null;
}

function ClickHandler({ onClick }: { onClick?: (point: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export type MapMarker = {
  id: string;
  position: LatLng;
  label?: string;
  color?: "shop" | "dropoff" | "origin" | "dest" | "default";
};

type RouteMapProps = {
  className?: string;
  markers?: MapMarker[];
  routeLine?: LatLng[];
  onMapClick?: (point: LatLng) => void;
  interactive?: boolean;
  zoom?: number;
  center?: LatLng;
};

export function RouteMap({
  className,
  markers = [],
  routeLine = [],
  onMapClick,
  interactive = true,
  zoom = DEFAULT_MAP_ZOOM,
  center = DEFAULT_MAP_CENTER,
}: RouteMapProps) {
  // Avoid React Strict Mode double-init ("Map container is already initialized")
  const [ready, setReady] = useState(false);
  const mapKey = useId();

  useEffect(() => {
    setReady(true);
  }, []);

  const fitPoints = [...markers.map((m) => m.position), ...routeLine];

  return (
    <div
      className={cn(
        "leaflet-shell relative w-full overflow-hidden rounded-xl border border-border/80 bg-[#e8eef2] shadow-sm",
        className,
      )}
      style={{ minHeight: 240 }}
    >
      {!ready ? (
        <div className="text-muted-foreground flex h-full min-h-[240px] items-center justify-center text-sm">
          Loading map…
        </div>
      ) : (
        <MapContainer
          key={mapKey}
          center={toLeafletLatLng(center)}
          zoom={zoom}
          className="leaflet-map-root"
          style={{ height: "100%", width: "100%", minHeight: 240 }}
          scrollWheelZoom={interactive}
          dragging={interactive}
          zoomControl={interactive}
          attributionControl
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> © CARTO'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={20}
          />
          <MapLifecycle
            points={fitPoints.length ? fitPoints : [center]}
            center={center}
          />
          {onMapClick ? <ClickHandler onClick={onMapClick} /> : null}
          {routeLine.length > 1 ? (
            <Polyline
              positions={routeLine.map(toLeafletLatLng)}
              pathOptions={{ color: "#0f766e", weight: 4, opacity: 0.85 }}
            />
          ) : null}
          {markers.map((marker) => (
            <Marker
              key={marker.id}
              position={toLeafletLatLng(marker.position)}
            >
              {marker.label ? <Popup>{marker.label}</Popup> : null}
            </Marker>
          ))}
        </MapContainer>
      )}
    </div>
  );
}
