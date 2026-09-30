"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { RefreshCw } from "lucide-react";

import {
  issueHandshakeQr,
  type HandshakeDisplay,
} from "@/app/actions/escrow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  orderId: string;
  initialHandshake?: HandshakeDisplay | null;
};

export function TravelerHandshakeQr({ orderId, initialHandshake }: Props) {
  const [handshake, setHandshake] = useState<HandshakeDisplay | null>(
    initialHandshake ?? null,
  );
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const result = await issueHandshakeQr(orderId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setHandshake(result.data);
    });
  }, [orderId]);

  useEffect(() => {
    if (!handshake) {
      refresh();
    }
  }, [handshake, refresh]);

  useEffect(() => {
    if (!handshake?.token) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(handshake.token, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: "M",
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [handshake?.token]);

  useEffect(() => {
    if (!handshake) return;

    const tick = () => {
      const left = Math.max(
        0,
        handshake.expiresAt - Math.floor(Date.now() / 1000),
      );
      setSecondsLeft(left);
      if (left <= 0) {
        refresh();
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [handshake, refresh]);

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">Delivery handshake</CardTitle>
          <Badge variant="secondary">IN_TRANSIT</Badge>
        </div>
        <CardDescription>
          Show this rotating QR to the buyer at drop-off. Code refreshes every
          few minutes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {qrDataUrl ? (
          <Image
            src={qrDataUrl}
            alt="Delivery verification QR code"
            width={280}
            height={280}
            unoptimized
            className="rounded-md border bg-white p-2"
          />
        ) : (
          <div className="bg-muted flex size-[280px] items-center justify-center rounded-md text-sm">
            Generating QR…
          </div>
        )}

        <div className="text-center">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Numeric fallback
          </p>
          <p className="font-mono text-3xl tracking-[0.35em]">
            {handshake?.numericToken ?? "————————"}
          </p>
          <p className="text-muted-foreground mt-2 text-xs">
            Expires in {secondsLeft}s
          </p>
        </div>

        {error ? (
          <p className="text-destructive text-center text-sm">{error}</p>
        ) : null}

        <Button
          type="button"
          variant="outline"
          onClick={refresh}
          disabled={pending}
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh code
        </Button>
      </CardContent>
    </Card>
  );
}
