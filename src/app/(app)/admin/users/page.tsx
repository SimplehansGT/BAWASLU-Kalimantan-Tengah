import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth";
import { getProfiles } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { UserManager } from "@/components/admin/user-manager";

export const metadata: Metadata = { title: "Pengguna" };

/**
 * Account administration.
 *
 * `requireAdmin` runs before anything is read, so a viewer who guesses the URL
 * is redirected rather than shown the list. Every mutation re-checks the caller's
 * role server-side as well — this guard is for the page, not for the actions.
 */
export default async function UsersPage() {
  const admin = await requireAdmin();
  const profiles = await getProfiles();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Pengguna"
        description="Akun hanya dapat dibuat dari halaman ini. Tidak ada pendaftaran mandiri dan tidak ada pemulihan kata sandi melalui email."
      />

      <UserManager profiles={profiles} currentUserId={admin.id} />
    </div>
  );
}
