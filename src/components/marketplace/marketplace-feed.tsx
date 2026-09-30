"use client";

import Link from "next/link";
import { Clock3, IndianRupee, MapPin } from "lucide-react";

import type { MarketplaceGig } from "@/app/actions/marketplace";
import { CombinedBountyCard } from "@/components/analytics/combined-bounty-card";
import { RouteMapDynamic } from "@/components/maps/route-map-dynamic";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CombinedBountyTripCard } from "@/lib/analytics/clustering";
import { formatInr } from "@/lib/geo/map";
import { cn } from "@/lib/utils";

export function MarketplaceFeed({
  gigs,
  clusters = [],
  hasViewerRoute,
}: {
  gigs: MarketplaceGig[];
  clusters?: CombinedBountyTripCard[];
  hasViewerRoute: boolean;
}) {
  if (gigs.length === 0 && clusters.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">No open gigs yet</CardTitle>
          <CardDescription>
            Post a buyer request or check back when villagers need city
            pickups.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/requests/new"
            className={cn(buttonVariants())}
          >
            Post a request
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!hasViewerRoute ? (
        <p className="text-muted-foreground rounded-lg border bg-muted/40 px-3 py-2 text-xs">
          Publish a trip to see personalized detour times for your corridor.{" "}
          <Link href="/routes/new" className="font-medium text-teal-800 underline">
            Add trip
          </Link>
        </p>
      ) : null}

      {clusters.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">
            Combined bounty trips
          </h2>
          {clusters.map((cluster) => (
            <CombinedBountyCard key={cluster.clusterId} cluster={cluster} />
          ))}
        </div>
      ) : null}

      {gigs.length > 0 ? (
        <h2 className="text-sm font-semibold tracking-tight">Single gigs</h2>
      ) : null}

      {gigs.map((gig) => (
        <Card key={gig.request.id} className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-base leading-snug">
                  {gig.request.title}
                </CardTitle>
                <CardDescription className="capitalize">
                  {gig.request.category} · {gig.request.shop_location_name}
                </CardDescription>
              </div>
              <Badge variant="secondary" className="shrink-0">
                Open
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <RouteMapDynamic
              className="h-40"
              interactive={false}
              markers={[
                {
                  id: "shop",
                  position: gig.shop,
                  label: gig.request.shop_location_name,
                },
                {
                  id: "dropoff",
                  position: gig.dropoff,
                  label: gig.request.dropoff_name ?? "Drop-off",
                },
              ]}
              routeLine={[gig.shop, gig.dropoff]}
              center={gig.shop}
              zoom={12}
            />

            <div className="flex flex-wrap gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-900">
                <Clock3 className="size-3.5" />
                {gig.detourLabel}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-teal-900">
                <IndianRupee className="size-3.5" />
                {formatInr(gig.estimatedPayout)} payout
              </span>
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                <MapPin className="size-3.5" />
                Escrow {formatInr(gig.request.total_escrow)}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
