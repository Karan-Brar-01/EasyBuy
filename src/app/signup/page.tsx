import { Suspense } from "react";

import { AuthForm } from "@/components/auth/auth-form";

export default function SignupPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-10">
      <Suspense fallback={<div className="text-muted-foreground text-sm">Loading…</div>}>
        <AuthForm mode="signup" />
      </Suspense>
    </main>
  );
}
