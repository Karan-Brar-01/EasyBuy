import Link from "next/link";

import { listMarketplaceGigs } from "@/app/actions/marketplace";
import { MarketplaceFeed } from "@/components/marketplace/marketplace-feed";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function MarketplacePage() {
  const result = await listMarketplaceGigs();

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 pb-16">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Discover
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Marketplace</h1>
          <p className="text-muted-foreground text-sm">
            Open crowd-shipping gigs near active commute corridors.
          </p>
        </div>
        <Link
          href="/routes/new"
          className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
        >
          My trip
        </Link>
      </div>

      {result.ok ? (
        <MarketplaceFeed
          gigs={result.gigs}
          clusters={result.clusters}
          hasViewerRoute={Boolean(result.viewerRoute)}
        />
      ) : (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium">Could not load gigs</p>
          <p className="text-muted-foreground mt-1">{result.error}</p>
          <p className="text-muted-foreground mt-3 text-xs">
            Ensure Supabase env vars are set and you are signed in.
          </p>
        </div>
      )}
    </main>
  );
}
