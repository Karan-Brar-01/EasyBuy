import { getAnalyticsDashboard } from "@/app/actions/analytics";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

export default async function AnalyticsPage() {
  const result = await getAnalyticsDashboard();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 pb-16">
      {result.ok ? (
        <AnalyticsDashboard
          telemetry={result.data.telemetry}
          clusters={result.data.clusters}
        />
      ) : (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium">Analytics unavailable</p>
          <p className="text-muted-foreground mt-1">{result.error}</p>
          <p className="text-muted-foreground mt-3 text-xs">
            Sign in with a Supabase session that can read orders and requests
            (RLS). Empty datasets still render zeroed metrics.
          </p>
        </div>
      )}
    </main>
  );
}
