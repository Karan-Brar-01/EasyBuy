"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Package } from "lucide-react";

import type { OrderDetail } from "@/app/actions/orders";
import { markOrderInTransit } from "@/app/actions/escrow";
import { BuyerVerifyScanner } from "@/components/escrow/buyer-verify-scanner";
import { EscrowPipelineBadge } from "@/components/escrow/escrow-pipeline-badge";
import { TravelerHandshakeQr } from "@/components/escrow/traveler-handshake-qr";
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
import { Separator } from "@/components/ui/separator";
import { formatInr } from "@/lib/geo/map";

export function OrderTrackingClient({ detail }: { detail: OrderDetail }) {
  const { order, request, role, markers, routeLine, route } = detail;
  const [pending, startTransition] = useTransition();

  const showTravelerQr =
    role === "traveler" && order.escrow_status === "in_transit";
  const showBuyerScanner =
    role === "buyer" && order.escrow_status === "in_transit";
  const canMarkInTransit =
    role === "traveler" && order.escrow_status === "claimed";

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Live order
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {request.title}
            </h1>
          </div>
          <Badge variant="outline" className="capitalize">
            {role}
          </Badge>
        </div>
        <p className="text-muted-foreground font-mono text-xs">{order.id}</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Escrow pipeline</CardTitle>
          <CardDescription>
            Funds stay locked until the drop-off handshake succeeds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EscrowPipelineBadge status={order.escrow_status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Route & waypoints</CardTitle>
          <CardDescription>
            {route
              ? `${route.origin_name} → ${route.destination_name}`
              : `${request.shop_location_name} → ${request.dropoff_name ?? "drop-off"}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <RouteMapDynamic
            className="h-64"
            markers={markers}
            routeLine={routeLine}
            interactive
          />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-muted-foreground text-xs">Item</p>
              <p className="font-medium">{formatInr(request.item_price)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-muted-foreground text-xs">Bounty</p>
              <p className="font-medium">{formatInr(request.bounty_fee)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {canMarkInTransit ? (
        <Button
          className="w-full"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await markOrderInTransit(order.id);
              window.location.reload();
            });
          }}
        >
          <Package className="mr-2 size-4" />
          Mark purchased · start transit
        </Button>
      ) : null}

      {showTravelerQr ? <TravelerHandshakeQr orderId={order.id} /> : null}
      {showBuyerScanner ? <BuyerVerifyScanner orderId={order.id} /> : null}

      {!showTravelerQr &&
      !showBuyerScanner &&
      order.escrow_status === "released_to_traveler" ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="font-medium">Delivery completed</p>
            <p className="text-muted-foreground text-sm">
              Escrow released to traveler.
            </p>
            <Link
              href="/marketplace"
              className="inline-flex h-8 items-center rounded-lg border px-3 text-sm"
            >
              Back to marketplace
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Separator />
      <p className="text-muted-foreground text-center text-xs">
        Need the dedicated screens?{" "}
        <Link
          className="underline"
          href={`/traveler/orders/${order.id}/handshake`}
        >
          Traveler QR
        </Link>{" "}
        ·{" "}
        <Link className="underline" href={`/buyer/orders/${order.id}/verify`}>
          Buyer verify
        </Link>
      </p>
    </div>
  );
}
