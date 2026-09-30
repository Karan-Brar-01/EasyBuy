"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

type AuthResult = { ok: true } | { ok: false; error: string };

export async function signUp(input: {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
}): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const fullName = input.fullName.trim();

  if (!email || !password || password.length < 6) {
    return { ok: false, error: "Use a valid email and password (min 6 chars)" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName || email.split("@")[0],
        role: input.role,
      },
    },
  });

  if (error) return { ok: false, error: error.message };

  // Ensure profile row exists / role is set (trigger may already create it)
  if (data.user) {
    await supabase.from("profiles").upsert({
      id: data.user.id,
      full_name: fullName || email.split("@")[0],
      role: input.role,
    });
  }

  if (!data.session) {
    return {
      ok: false,
      error:
        "Account created — check your email to confirm, or disable email confirmation in Supabase Auth settings for local testing.",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function signIn(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) {
    return { ok: false, error: "Email and password are required" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
    role: profile?.role ?? "buyer",
  };
}
