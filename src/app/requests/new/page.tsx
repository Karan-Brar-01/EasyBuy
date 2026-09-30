import { NewRequestForm } from "@/components/requests/new-request-form";

export default function NewRequestPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 pb-16">
      <div className="mb-6 space-y-1">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          Buyer
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Request a pickup
        </h1>
        <p className="text-muted-foreground text-sm">
          Pin the city shop and your village drop-off. We preview a dynamic
          bounty before escrow locks.
        </p>
      </div>
      <NewRequestForm />
    </main>
  );
}
