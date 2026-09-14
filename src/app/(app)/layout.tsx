import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

/**
 * Auth guard for every authenticated page.
 *
 * Middleware already turns away anonymous requests; this runs again on the
 * server so a page can never render its data if the session is gone or the
 * account was deactivated between the two checks.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <AppShell
      username={user.profile?.username ?? "pengguna"}
      fullName={user.profile?.full_name ?? null}
      role={user.profile?.role ?? "viewer"}
    >
      {children}
    </AppShell>
  );
}
