"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { signIn, signUp } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UserRole } from "@/types/database";
import { cn } from "@/lib/utils";

const ROLES: { id: UserRole; label: string; hint: string }[] = [
  { id: "buyer", label: "Buyer", hint: "Post village requests" },
  { id: "traveler", label: "Traveler", hint: "Carry city pickups" },
  { id: "both", label: "Both", hint: "Do either" },
];

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/marketplace";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("buyer");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      setError(null);
      const result =
        mode === "login"
          ? await signIn({ email, password })
          : await signUp({ email, password, fullName, role });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(next);
      router.refresh();
    });
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-xl">
          {mode === "login" ? "Sign in" : "Create account"}
        </CardTitle>
        <CardDescription>
          {mode === "login"
            ? "Sign in to post requests or publish trips."
            : "Pick a role so RouteRelay knows how you use the app."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "signup" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <Label>I am a</Label>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRole(r.id)}
                      className={cn(
                        "rounded-xl border px-2 py-2 text-center text-xs transition",
                        role === r.id
                          ? "border-teal-700 bg-teal-50 text-teal-950"
                          : "border-border hover:bg-muted/50",
                      )}
                    >
                      <span className="block font-medium">{r.label}</span>
                      <span className="text-muted-foreground mt-0.5 block text-[10px]">
                        {r.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gmail.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>

        <p className="text-muted-foreground mt-4 text-center text-sm">
          {mode === "login" ? (
            <>
              New here?{" "}
              <Link
                href={`/signup?next=${encodeURIComponent(next)}`}
                className="font-medium text-teal-800 underline"
              >
                Create an account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link
                href={`/login?next=${encodeURIComponent(next)}`}
                className="font-medium text-teal-800 underline"
              >
                Sign in
              </Link>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
