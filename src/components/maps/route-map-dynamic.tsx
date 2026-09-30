"use client";

import dynamic from "next/dynamic";

import type { ComponentProps } from "react";

const RouteMapInner = dynamic(
  () =>
    import("@/components/maps/route-map").then((mod) => mod.RouteMap),
  {
    ssr: false,
    loading: () => (
      <div className="bg-muted flex min-h-[220px] w-full items-center justify-center rounded-xl border text-sm text-muted-foreground">
        Loading map…
      </div>
    ),
  },
);

export function RouteMapDynamic(
  props: ComponentProps<typeof RouteMapInner>,
) {
  return <RouteMapInner {...props} />;
}
