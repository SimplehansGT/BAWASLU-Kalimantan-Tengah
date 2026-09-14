"use client";

import { Check, Copy, KeyRound, Loader2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createUserAction, resetPasswordAction, setUserActiveAction } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import type { ProfileRow } from "@/types/database";
import { ConfirmDialog } from "@/components/reports/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Shows a generated password exactly once.
 *
 * There is no email to send it to and no self-service reset, so this dialog is
 * the only moment it is ever visible. If it is lost, an admin issues a new one.
 */
function PasswordDialog({
  credentials,
  onClose,
}: {
  credentials: { username: string; password: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(credentials.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin. Salin manual dari kotak di atas.");
    }
  }

  return (
    <Dialog open={credentials !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kata sandi untuk {credentials?.username}</DialogTitle>
          <DialogDescription>
            Salin sekarang dan serahkan langsung kepada yang bersangkutan. Kata
            sandi ini tidak dapat ditampilkan lagi.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-sm break-all">
              {credentials?.password}
            </code>
            <Button variant="outline" size="icon" onClick={copy} aria-label="Salin kata sandi">
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            </Button>
          </div>

          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200 text-pretty">
            Tidak ada email dan tidak ada pemulihan mandiri. Jika kata sandi
            hilang, administrator harus menerbitkan yang baru.
          </p>

          <Button onClick={onClose}>Sudah saya salin</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (credentials: { username: string; password: string }) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState("admin");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const data = new FormData(event.currentTarget);
    data.set("role", role);

    const result = await createUserAction(data);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onOpenChange(false);
    onCreated(result.data);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buat akun baru</DialogTitle>
          <DialogDescription>
            Akun hanya dapat dibuat dari sini. Tidak ada pendaftaran mandiri.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-username">Nama pengguna</Label>
            <Input
              id="new-username"
              name="username"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="budi"
            />
            <p className="text-xs text-muted-foreground">
              Huruf kecil, angka, titik, garis bawah, dan tanda hubung. Minimal 3 karakter.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-fullname">Nama lengkap</Label>
            <Input id="new-fullname" name="full_name" placeholder="Budi Santoso" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-role">Peran</Label>
            <Select value={role} onValueChange={(v) => setRole(v ?? "admin")}>
              <SelectTrigger id="new-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin — akses penuh</SelectItem>
                <SelectItem value="viewer">Peninjau — hanya baca</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Membuat…
                </>
              ) : (
                "Buat akun"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Batal
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UserManager({
  profiles,
  currentUserId,
}: {
  profiles: ProfileRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(
    null,
  );
  const [resetTarget, setResetTarget] = useState<ProfileRow | null>(null);

  async function onToggleActive(profile: ProfileRow, isActive: boolean) {
    const result = await setUserActiveAction(profile.id, isActive);
    if (result.ok) {
      toast.success(isActive ? `${profile.username} diaktifkan.` : `${profile.username} dinonaktifkan.`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function onResetPassword() {
    if (!resetTarget) return;
    const result = await resetPasswordAction(resetTarget.id);
    if (result.ok) {
      setCredentials({ username: resetTarget.username, password: result.data.password });
    } else {
      toast.error(result.error);
    }
    setResetTarget(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="size-4" aria-hidden />
          Buat akun
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama pengguna</TableHead>
              <TableHead>Nama lengkap</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead>Dibuat</TableHead>
              <TableHead>Aktif</TableHead>
              <TableHead className="text-right">Tindakan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((profile) => (
              <TableRow key={profile.id}>
                <TableCell className="font-medium">
                  {profile.username}
                  {profile.id === currentUserId ? (
                    <Badge variant="secondary" className="ml-2">
                      Anda
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {profile.full_name ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {profile.role === "admin" ? "Admin" : "Peninjau"}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDateTime(profile.created_at)}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={profile.is_active}
                    disabled={profile.id === currentUserId}
                    onCheckedChange={(v) => onToggleActive(profile, v)}
                    aria-label={`Aktifkan ${profile.username}`}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => setResetTarget(profile)}>
                    <KeyRound className="size-4" aria-hidden />
                    Kata sandi baru
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={setCredentials}
      />

      <PasswordDialog credentials={credentials} onClose={() => setCredentials(null)} />

      <ConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(open) => !open && setResetTarget(null)}
        title={`Terbitkan kata sandi baru untuk ${resetTarget?.username}?`}
        description="Kata sandi lama langsung tidak berlaku. Kata sandi baru hanya ditampilkan satu kali dan harus diserahkan langsung."
        confirmLabel="Ya, terbitkan"
        onConfirm={onResetPassword}
      />
    </div>
  );
}
