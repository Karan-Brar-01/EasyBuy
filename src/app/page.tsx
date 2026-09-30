import Link from "next/link";
import { ArrowRight, MapPinned, Package, Route } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12">
      <div className="space-y-4">
        <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
          Rural ↔ urban crowd-shipping
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          RouteRelay
        </h1>
        <p className="text-muted-foreground max-w-xl text-base leading-relaxed">
          Village buyers hitch purchases onto daily city commute routes. Escrow
          stays locked until a QR handshake at drop-off.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href="/marketplace"
            className={cn(buttonVariants({ size: "lg" }))}
          >
            Browse gigs
            <ArrowRight className="ml-1 size-4" />
          </Link>
          <Link
            href="/requests/new"
            className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
          >
            I need something
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/routes/new" className="block">
          <Card className="h-full transition hover:border-teal-700/40">
            <CardHeader className="pb-2">
              <Route className="text-muted-foreground mb-2 size-5" />
              <CardTitle className="text-base">Publish a trip</CardTitle>
              <CardDescription>
                City → village with Bike, Car, or Bus capacity.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/requests/new" className="block">
          <Card className="h-full transition hover:border-teal-700/40">
            <CardHeader className="pb-2">
              <Package className="text-muted-foreground mb-2 size-5" />
              <CardTitle className="text-base">Post a request</CardTitle>
              <CardDescription>
                Pin shop & drop-off; preview dynamic bounty.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/marketplace" className="block">
          <Card className="h-full transition hover:border-teal-700/40">
            <CardHeader className="pb-2">
              <MapPinned className="text-muted-foreground mb-2 size-5" />
              <CardTitle className="text-base">Marketplace</CardTitle>
              <CardDescription>
                Live gigs with detour minutes and payout.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <p className="text-muted-foreground text-center text-sm">
        <Link href="/analytics" className="font-medium text-teal-800 underline">
          Open analytics
        </Link>{" "}
        for deviation, emissions, and combined bounty clusters.
      </p>
    </main>
  );
}
