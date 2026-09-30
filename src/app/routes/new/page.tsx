import { NewRouteForm } from "@/components/routes/new-route-form";

export default function NewRoutePage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 pb-16">
      <div className="mb-6 space-y-1">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          Traveler
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Publish a trip
        </h1>
        <p className="text-muted-foreground text-sm">
          Register your city → village commute so buyers can hitch a delivery
          onto your route.
        </p>
      </div>
      <NewRouteForm />
    </main>
  );
}
