import { OrderTrackingClient } from "@/components/orders/order-tracking-client";
import { getOrderDetail } from "@/app/actions/orders";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  const result = await getOrderDetail(id);

  if (!result.ok) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
        <h1 className="text-xl font-semibold">Order unavailable</h1>
        <p className="text-muted-foreground mt-2 text-sm">{result.error}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 pb-16">
      <OrderTrackingClient detail={result.data} />
    </main>
  );
}
