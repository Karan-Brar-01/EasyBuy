import type { ReactNode } from "react";
import {
  Clock3,
  Fuel,
  Leaf,
  Scale,
  Timer,
  TrendingDown,
} from "lucide-react";

import type { CombinedBountyTripCard } from "@/lib/analytics/clustering";
import type { AnalyticsTelemetry } from "@/lib/analytics/telemetry";
import { CombinedBountyCard } from "@/components/analytics/combined-bounty-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function hoursLabel(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toFixed(1)} h`;
}

export function AnalyticsDashboard({
  telemetry,
  clusters,
}: {
  telemetry: AnalyticsTelemetry;
  clusters: CombinedBountyTripCard[];
}) {
  const { deviation, emissions, escrow } = telemetry;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Admin telemetry
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Commuter logistics vs dedicated courier — updated{" "}
            {new Date(telemetry.generatedAt).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{telemetry.openRequestCount} open</Badge>
          <Badge variant="secondary">
            {telemetry.activeRouteCount} routes
          </Badge>
          <Badge variant="secondary">
            {telemetry.batchClusterCount} batches
          </Badge>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Timer className="size-4 text-teal-800" />
              <CardTitle className="text-base">Deviation vs courier</CardTitle>
            </div>
            <CardDescription>
              Avg commuter detour overhead compared to a dedicated courier
              shop→village run (n={deviation.sampleSize}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Metric
                label="Commuter detour"
                value={`${deviation.avgCommuterDeviationMins} min`}
                hint="Extra time on commute"
              />
              <Metric
                label="Courier transit"
                value={`${deviation.avgCourierTransitMins} min`}
                hint="Full dedicated trip"
              />
            </div>
            <div className="rounded-xl border border-teal-800/15 bg-teal-50/70 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-teal-950">
                <TrendingDown className="size-4" />
                {deviation.avgTimeSavedMins >= 0
                  ? `${deviation.avgTimeSavedMins} min saved vs courier`
                  : `${Math.abs(deviation.avgTimeSavedMins)} min slower than courier`}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                Relative savings ratio {pct(Math.max(0, deviation.savingsRatio))}
              </p>
              <DeviationBars
                commuter={deviation.avgCommuterDeviationMins}
                courier={deviation.avgCourierTransitMins}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Leaf className="size-4 text-emerald-700" />
              <CardTitle className="text-base">Emissions & fuel saved</CardTitle>
            </div>
            <CardDescription>
              Avoided dedicated courier kilometers minus incremental detour
              burn (n={emissions.sampleSize}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Metric
                label="CO₂ saved"
                value={`${emissions.co2KgSaved} kg`}
                hint="Net vs courier fleet"
              />
              <Metric
                label="Fuel saved"
                value={`${emissions.fuelLitersSaved} L`}
                hint="Petrol equivalent"
              />
            </div>
            <div className="text-muted-foreground flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs">
              <Fuel className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Courier km avoided {emissions.courierKmAvoided} · detour km{" "}
                {emissions.detourKmDriven} · net {emissions.netKmAvoided} km
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Scale className="size-4 text-amber-800" />
              <CardTitle className="text-base">
                Escrow health & fulfillment
              </CardTitle>
            </div>
            <CardDescription>
              Dispute rate and traveler latency from claim → release.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric
                label="Dispute rate"
                value={pct(escrow.disputeRate)}
                hint={`${escrow.disputedOrders} / ${escrow.totalOrders} orders`}
              />
              <Metric
                label="Completed"
                value={String(escrow.completedOrders)}
                hint="Released / completed"
              />
              <Metric
                label="Avg fulfillment"
                value={hoursLabel(escrow.avgFulfillmentLatencyHours)}
                hint="Claim → handshake"
              />
              <Metric
                label="Median latency"
                value={hoursLabel(escrow.medianFulfillmentLatencyHours)}
                hint={
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="size-3" /> traveler SLA
                  </span>
                }
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Combined bounty clusters
          </h2>
          <p className="text-muted-foreground text-sm">
            Same city market → same village, within a 2-hour window. Batch bonus
            stacked on individual bounties.
          </p>
        </div>

        {clusters.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-8 text-center text-sm">
              No multi-request clusters right now. When two or more open
              requests share a market and village within a 2-hour window, a
              combined trip card appears here and on the marketplace.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {clusters.map((cluster) => (
              <CombinedBountyCard key={cluster.clusterId} cluster={cluster} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-background/80 p-3">
      <p className="text-muted-foreground text-[11px] uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
      {hint ? (
        <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

function DeviationBars({
  commuter,
  courier,
}: {
  commuter: number;
  courier: number;
}) {
  const max = Math.max(commuter, courier, 1);
  return (
    <div className="mt-3 space-y-2">
      <Bar label="Commuter" value={commuter} max={max} tone="teal" />
      <Bar label="Courier" value={courier} max={max} tone="amber" />
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "teal" | "amber";
}) {
  const width = `${Math.max(4, (value / max) * 100)}%`;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span>{label}</span>
        <span>{value} min</span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className={
            tone === "teal" ? "h-full bg-teal-700" : "h-full bg-amber-600"
          }
          style={{ width }}
        />
      </div>
    </div>
  );
}
