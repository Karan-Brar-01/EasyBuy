"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bike, Bus, Car } from "lucide-react";

import {
  createTravelRoute,
  type TripVehicle,
} from "@/app/actions/routes";
import { RouteMapDynamic } from "@/components/maps/route-map-dynamic";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_MAP_CENTER } from "@/lib/geo/map";
import type { LatLng } from "@/lib/geo/routing";
import { cn } from "@/lib/utils";

const VEHICLES: {
  id: TripVehicle;
  label: string;
  hint: string;
  icon: typeof Bike;
}[] = [
  { id: "bike", label: "Bike", hint: "Small parcels", icon: Bike },
  { id: "car", label: "Car", hint: "Bags & boxes", icon: Car },
  { id: "bus", label: "Bus", hint: "Bulky capacity", icon: Bus },
];

type PickMode = "origin" | "destination";

export function NewRouteForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>("origin");
  const [originName, setOriginName] = useState("");
  const [destinationName, setDestinationName] = useState("");
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [departureTime, setDepartureTime] = useState("");
  const [tripVehicle, setTripVehicle] = useState<TripVehicle>("bike");
  const [notes, setNotes] = useState("");

  const markers = useMemo(() => {
    const list = [];
    if (origin)
      list.push({
        id: "origin",
        position: origin,
        label: originName || "City origin",
      });
    if (destination)
      list.push({
        id: "dest",
        position: destination,
        label: destinationName || "Village destination",
      });
    return list;
  }, [origin, destination, originName, destinationName]);

  const routeLine = useMemo(() => {
    if (origin && destination) return [origin, destination];
    return [];
  }, [origin, destination]);

  function onMapClick(point: LatLng) {
    if (pickMode === "origin") {
      setOrigin(point);
      setPickMode("destination");
    } else {
      setDestination(point);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!origin || !destination) {
      setError("Tap the map to set city origin and village destination");
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await createTravelRoute({
        originName,
        destinationName,
        originLat: origin.lat,
        originLng: origin.lng,
        destinationLat: destination.lat,
        destinationLng: destination.lng,
        departureTime,
        tripVehicle,
        notes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/marketplace");
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">City → Village trip</CardTitle>
          <CardDescription>
            Tap the map to set origin, then destination. Switch pins below if
            needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={pickMode === "origin" ? "default" : "outline"}
              onClick={() => setPickMode("origin")}
            >
              Set city
            </Button>
            <Button
              type="button"
              size="sm"
              variant={pickMode === "destination" ? "default" : "outline"}
              onClick={() => setPickMode("destination")}
            >
              Set village
            </Button>
          </div>
          <RouteMapDynamic
            className="h-64 sm:h-80"
            markers={markers}
            routeLine={routeLine}
            onMapClick={onMapClick}
            center={origin ?? DEFAULT_MAP_CENTER}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="originName">Origin city</Label>
              <Input
                id="originName"
                required
                placeholder="e.g. Chandigarh Sector 17"
                value={originName}
                onChange={(e) => setOriginName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="destinationName">Destination village</Label>
              <Input
                id="destinationName"
                required
                placeholder="e.g. Kharar outskirts"
                value={destinationName}
                onChange={(e) => setDestinationName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="departure">Departure</Label>
            <Input
              id="departure"
              type="datetime-local"
              required
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Vehicle capacity</Label>
            <div className="grid grid-cols-3 gap-2">
              {VEHICLES.map((v) => {
                const Icon = v.icon;
                const active = tripVehicle === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setTripVehicle(v.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition",
                      active
                        ? "border-teal-700 bg-teal-50 text-teal-900"
                        : "border-border bg-background hover:bg-muted/60",
                    )}
                  >
                    <Icon className="size-5" />
                    <span className="text-sm font-medium">{v.label}</span>
                    <span className="text-muted-foreground text-[10px]">
                      {v.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Usual stops, bag limit, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error ? (
            <p className="text-destructive text-sm">
              {error.toLowerCase().includes("sign in") ? (
                <>
                  {error}.{" "}
                  <a href="/login?next=/routes/new" className="underline">
                    Sign in
                  </a>
                </>
              ) : (
                error
              )}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Publishing…" : "Publish trip"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
