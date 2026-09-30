import { Layers, MapPin } from "lucide-react";

import type { CombinedBountyTripCard } from "@/lib/analytics/clustering";
import { RouteMapDynamic } from "@/components/maps/route-map-dynamic";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatInr } from "@/lib/geo/map";

export function CombinedBountyCard({
  cluster,
}: {
  cluster: CombinedBountyTripCard;
}) {
  const windowLabel = `${new Date(cluster.windowStart).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  })} – ${new Date(cluster.windowEnd).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  return (
    <Card className="overflow-hidden border-teal-800/20">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-teal-800" />
              <CardTitle className="text-base">Combined bounty trip</CardTitle>
            </div>
            <CardDescription>
              {cluster.marketLabel} → {cluster.villageLabel} · {windowLabel}
            </CardDescription>
          </div>
          <Badge className="bg-teal-800 text-white hover:bg-teal-800">
            {cluster.requestCount} requests
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <RouteMapDynamic
          className="h-36"
          interactive={false}
          markers={[
            {
              id: "market",
              position: cluster.marketCentroid,
              label: cluster.marketLabel,
            },
            {
              id: "village",
              position: cluster.villageCentroid,
              label: cluster.villageLabel,
            },
          ]}
          routeLine={[cluster.marketCentroid, cluster.villageCentroid]}
          center={cluster.marketCentroid}
          zoom={11}
        />

        <ul className="text-muted-foreground space-y-1 text-xs">
          {cluster.titles.slice(0, 4).map((title) => (
            <li key={title} className="truncate">
              · {title}
            </li>
          ))}
          {cluster.titles.length > 4 ? (
            <li>· +{cluster.titles.length - 4} more</li>
          ) : null}
        </ul>

        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-teal-50/80 px-3 py-3">
          <div>
            <p className="text-muted-foreground text-[11px] uppercase tracking-wide">
              Combined bounty
            </p>
            <p className="text-2xl font-semibold text-teal-950">
              {formatInr(cluster.combinedBounty)}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Individuals {formatInr(cluster.sumIndividualBounties)}
              {cluster.batchBonus > 0
                ? ` + batch bonus ${formatInr(cluster.batchBonus)}`
                : ""}
            </p>
          </div>
          <div className="text-right text-xs text-teal-900">
            <p className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              ~{cluster.corridorKm} km corridor
            </p>
            <p className="text-muted-foreground mt-1">
              Items {formatInr(cluster.totalItemValue)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
