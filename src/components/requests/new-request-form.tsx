"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createDeliveryRequest,
  previewDynamicBounty,
} from "@/app/actions/requests";
import { RouteMapDynamic } from "@/components/maps/route-map-dynamic";
import { Badge } from "@/components/ui/badge";
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
import { formatInr, DEFAULT_MAP_CENTER } from "@/lib/geo/map";
import type { LatLng } from "@/lib/geo/routing";
import type { ItemCategory } from "@/types/database";
import { cn } from "@/lib/utils";

const CATEGORIES: ItemCategory[] = [
  "groceries",
  "pharmacy",
  "electronics",
  "clothing",
  "documents",
  "other",
];

type PickMode = "shop" | "dropoff";

export function NewRequestForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>("shop");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ItemCategory>("groceries");
  const [description, setDescription] = useState("");
  const [shopName, setShopName] = useState("");
  const [dropoffName, setDropoffName] = useState("");
  const [shop, setShop] = useState<LatLng | null>(null);
  const [dropoff, setDropoff] = useState<LatLng | null>(null);
  const [itemPrice, setItemPrice] = useState("500");
  const [neededBy, setNeededBy] = useState("");
  const [bountyFee, setBountyFee] = useState(40);
  const [bountyHint, setBountyHint] = useState(
    "Tap shop and drop-off to preview bounty",
  );

  const markers = useMemo(() => {
    const list = [];
    if (shop)
      list.push({
        id: "shop",
        position: shop,
        label: shopName || "City shop",
      });
    if (dropoff)
      list.push({
        id: "dropoff",
        position: dropoff,
        label: dropoffName || "Village drop-off",
      });
    return list;
  }, [shop, dropoff, shopName, dropoffName]);

  useEffect(() => {
    if (!shop || !dropoff) return;
    let cancelled = false;
    void previewDynamicBounty({
      shopLat: shop.lat,
      shopLng: shop.lng,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      neededBy: neededBy || null,
    }).then((result) => {
      if (cancelled || !result.ok) return;
      setBountyFee(result.data.breakdown.bountyFee);
      setBountyHint(
        `Base ₹${result.data.breakdown.baseFee} + detour ~${result.data.estimateKm.toFixed(1)} km / ${Math.round(result.data.estimateMins)} min + urgency ₹${result.data.breakdown.urgencyMultiplier}`,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [shop, dropoff, neededBy]);

  function onMapClick(point: LatLng) {
    if (pickMode === "shop") {
      setShop(point);
      setPickMode("dropoff");
    } else {
      setDropoff(point);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!shop || !dropoff) {
      setError("Set shop and drop-off points on the map");
      return;
    }
    const price = Number(itemPrice);
    if (!Number.isFinite(price)) {
      setError("Enter a valid item price");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await createDeliveryRequest({
        title,
        category,
        description,
        shopLocationName: shopName,
        dropoffName,
        shopLat: shop.lat,
        shopLng: shop.lng,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        itemPrice: price,
        bountyFee,
        neededBy: neededBy || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/orders/${result.data.order.id}`);
    });
  }

  const total = Number(itemPrice || 0) + bountyFee;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Shop & drop-off</CardTitle>
          <CardDescription>
            Tap the map: first the city shop, then your village drop-off.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={pickMode === "shop" ? "default" : "outline"}
              onClick={() => setPickMode("shop")}
            >
              Shop pin
            </Button>
            <Button
              type="button"
              size="sm"
              variant={pickMode === "dropoff" ? "default" : "outline"}
              onClick={() => setPickMode("dropoff")}
            >
              Drop-off pin
            </Button>
          </div>
          <RouteMapDynamic
            className="h-64 sm:h-80"
            markers={markers}
            routeLine={shop && dropoff ? [shop, dropoff] : []}
            onMapClick={onMapClick}
            center={shop ?? DEFAULT_MAP_CENTER}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="title">What do you need?</Label>
            <Input
              id="title"
              required
              placeholder="e.g. Blood pressure medicine"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs capitalize",
                    category === c
                      ? "border-teal-700 bg-teal-50 text-teal-900"
                      : "border-border",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="shopName">Shop name / area</Label>
              <Input
                id="shopName"
                required
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="City pharmacy"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dropoffName">Drop-off label</Label>
              <Input
                id="dropoffName"
                value={dropoffName}
                onChange={(e) => setDropoffName(e.target.value)}
                placeholder="Home / village node"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="itemPrice">Item price (₹)</Label>
              <Input
                id="itemPrice"
                type="number"
                min={0}
                step="1"
                required
                value={itemPrice}
                onChange={(e) => setItemPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="neededBy">Needed by</Label>
              <Input
                id="neededBy"
                type="datetime-local"
                value={neededBy}
                onChange={(e) => setNeededBy(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Details</Label>
            <Textarea
              id="description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brand, size, substitute OK?"
            />
          </div>

          <div className="rounded-xl border border-teal-800/15 bg-teal-50/80 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-teal-950">
                  Dynamic bounty preview
                </p>
                <p className="text-muted-foreground mt-1 text-xs">{bountyHint}</p>
              </div>
              <Badge className="bg-teal-800 text-white hover:bg-teal-800">
                {formatInr(bountyFee)}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              Escrow total ≈ {formatInr(total)} (item + bounty)
            </p>
          </div>

          {error ? (
            <p className="text-destructive text-sm">
              {error.includes("Sign in") ? (
                <>
                  {error}.{" "}
                  <a href="/login?next=/requests/new" className="underline">
                    Sign in
                  </a>
                </>
              ) : (
                error
              )}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Posting…" : "Post request & lock escrow"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
