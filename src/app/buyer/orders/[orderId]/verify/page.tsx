import { BuyerVerifyScanner } from "@/components/escrow/buyer-verify-scanner";

type PageProps = {
  params: Promise<{ orderId: string }>;
};

export default async function BuyerVerifyPage({ params }: PageProps) {
  const { orderId } = await params;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Confirm delivery
        </h1>
        <p className="text-muted-foreground text-sm">
          Order <span className="font-mono">{orderId}</span>
        </p>
      </div>
      <BuyerVerifyScanner orderId={orderId} />
    </main>
  );
}
