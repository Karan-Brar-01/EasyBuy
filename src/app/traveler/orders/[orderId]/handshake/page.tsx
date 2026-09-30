import { TravelerHandshakeQr } from "@/components/escrow/traveler-handshake-qr";

type PageProps = {
  params: Promise<{ orderId: string }>;
};

export default async function TravelerHandshakePage({ params }: PageProps) {
  const { orderId } = await params;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Handshake QR</h1>
        <p className="text-muted-foreground text-sm">
          Order <span className="font-mono">{orderId}</span>
        </p>
      </div>
      <TravelerHandshakeQr orderId={orderId} />
    </main>
  );
}
