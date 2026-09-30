"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { CheckCircle2, Keyboard } from "lucide-react";

import { verifyDeliveryAndReleaseFunds } from "@/app/actions/escrow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Props = {
  orderId: string;
};

export function BuyerVerifyScanner({ orderId }: Props) {
  const [manualToken, setManualToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const [scannerReady, setScannerReady] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const verifyingRef = useRef(false);
  const regionId = "routerelay-qr-reader";

  const submitToken = (token: string) => {
    if (verifyingRef.current || pending || success) return;
    verifyingRef.current = true;
    setError(null);

    startTransition(async () => {
      const result = await verifyDeliveryAndReleaseFunds(orderId, token);
      verifyingRef.current = false;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      const scanner = scannerRef.current;
      if (scanner?.isScanning) {
        await scanner.stop().catch(() => undefined);
      }
    });
  };

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(regionId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          if (!cancelled) submitToken(decoded);
        },
        () => {
          /* ignore frame miss */
        },
      )
      .then(() => {
        if (!cancelled) setScannerReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setScannerReady(false);
          setError(
            "Camera unavailable — enter the 8-digit code from the traveler instead.",
          );
        }
      });

    return () => {
      cancelled = true;
      if (scanner.isScanning) {
        void scanner.stop().catch(() => undefined);
      }
      scannerRef.current = null;
    };
    // Mount once per order
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">Verify delivery</CardTitle>
          <Badge variant={success ? "default" : "secondary"}>
            {success ? "RELEASED" : "SCAN"}
          </Badge>
        </div>
        <CardDescription>
          Scan the traveler&apos;s QR to inspect the item and release escrowed
          funds instantly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {success ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle2 className="size-12 text-emerald-600" />
            <p className="font-medium">Funds released to traveler</p>
            <p className="text-muted-foreground text-sm">
              Request marked completed · escrow status RELEASED_TO_TRAVELER
            </p>
          </div>
        ) : (
          <>
            <div
              id={regionId}
              className="bg-muted overflow-hidden rounded-md"
            />
            {!scannerReady ? (
              <p className="text-muted-foreground text-center text-xs">
                Starting camera…
              </p>
            ) : null}

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Keyboard className="size-4" />
                Or enter 8-digit code
              </label>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  placeholder="12345678"
                  value={manualToken}
                  onChange={(e) =>
                    setManualToken(e.target.value.replace(/\D/g, "").slice(0, 8))
                  }
                />
                <Button
                  type="button"
                  disabled={pending || manualToken.length !== 8}
                  onClick={() => submitToken(manualToken)}
                >
                  Verify
                </Button>
              </div>
            </div>
          </>
        )}

        {error ? (
          <p className="text-destructive text-center text-sm">{error}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
