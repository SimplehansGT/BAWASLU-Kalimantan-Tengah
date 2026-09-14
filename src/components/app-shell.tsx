"use client";

import {
  FilePlus2,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { signOutAction } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type NavItem = { href: string; label: string; icon: React.ElementType; adminOnly?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Beranda", icon: LayoutDashboard },
  { href: "/reports", label: "Laporan", icon: FileText },
  { href: "/reports/new", label: "Laporan Baru", icon: FilePlus2 },
  { href: "/admin/users", label: "Pengguna", icon: Users, adminOnly: true },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // /reports must not light up while on /reports/new.
  if (href === "/reports") return pathname === "/reports" || /^\/reports\/[^/]+$/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The server has no idea which theme is active, so the icon can only be
  // decided after hydration.
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-3 px-3 text-sidebar-foreground/70"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Beralih ke mode terang" : "Beralih ke mode gelap"}
    >
      {mounted && isDark ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
      {mounted && isDark ? "Mode terang" : "Mode gelap"}
    </Button>
  );
}

function SidebarBody({
  username,
  fullName,
  role,
  onNavigate,
}: {
  username: string;
  fullName: string | null;
  role: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-3 px-2 py-1">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShieldCheck className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">Pengawasan Pemilu</p>
          <p className="truncate text-xs text-muted-foreground">Bawaslu Kalimantan Tengah</p>
        </div>
      </Link>

      <Separator />

      <div className="flex-1 overflow-y-auto">
        <NavLinks isAdmin={role === "admin"} onNavigate={onNavigate} />
      </div>

      <Separator />

      <div className="flex flex-col gap-1">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium">{fullName || username}</p>
          <p className="truncate text-xs text-muted-foreground">
            {username} · {role === "admin" ? "Admin" : "Peninjau"}
          </p>
        </div>

        <ThemeToggle />

        <form action={signOutAction}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 px-3 text-sidebar-foreground/70"
          >
            <LogOut className="size-4" aria-hidden />
            Keluar
          </Button>
        </form>
      </div>
    </div>
  );
}

export function AppShell({
  username,
  fullName,
  role,
  children,
}: {
  username: string;
  fullName: string | null;
  role: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer when the route changes.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar lg:block">
        <div className="sticky top-0 h-dvh">
          <SidebarBody username={username} fullName={fullName} role={role} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Buka menu">
                  <Menu className="size-5" aria-hidden />
                </Button>
              }
            />
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
              <SheetTitle className="sr-only">Menu navigasi</SheetTitle>
              <SidebarBody
                username={username}
                fullName={fullName}
                role={role}
                onNavigate={() => setOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <span className="truncate text-sm font-semibold">Pengawasan Pemilu</span>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
