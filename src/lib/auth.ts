import "server-only";

import { redirect } from "next/navigation";

import { INTERNAL_EMAIL_DOMAIN } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/database";

/**
 * Supabase Auth insists on an email address; this system has no email at all.
 * A username is therefore mapped onto a synthetic address on an internal domain
 * that nothing ever sends to. Users never see it.
 */
export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${INTERNAL_EMAIL_DOMAIN}`;
}

/** Lowercase, trimmed, and limited to characters that survive an email local part. */
export function normalizeUsername(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

export function isValidUsername(username: string): boolean {
  const u = normalizeUsername(username);
  return u.length >= 3 && u.length <= 32 && /^[a-z0-9]/.test(u);
}

export type SessionUser = {
  id: string;
  profile: ProfileRow | null;
};

/** Current user and profile, or null. Does not redirect. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { id: user.id, profile: profile ?? null };
}

/**
 * Guard for every protected page. Middleware already redirects unauthenticated
 * requests; this is the second line, and it also catches a user whose account
 * was deactivated mid-session.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (user.profile && !user.profile.is_active) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login?error=nonaktif");
  }

  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.profile?.role !== "admin") redirect("/?error=akses-ditolak");
  return user;
}

/** Non-redirecting admin check, for server actions that return an error instead. */
export async function isAdmin(): Promise<boolean> {
  const user = await getSessionUser();
  return user?.profile?.role === "admin" && user.profile.is_active === true;
}
