"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileText,
  HeartPulse,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Share2,
  Shield,
  User,
  Users,
  X,
} from "lucide-react";
import { patientNavItems } from "@/data/navigation";
import { LOGIN_PATH } from "@/lib/auth-routes";
import { cn } from "@/lib/utils";

const icons = {
  LayoutDashboard,
  User,
  Users,
  ClipboardList,
  ClipboardCheck,
  CalendarDays,
  Share2,
  FileText,
  Shield,
  LifeBuoy,
};

export function Sidebar({
  open = false,
  onClose,
  items = patientNavItems,
  onLogout,
  loginHref = LOGIN_PATH,
}) {
  const pathname = usePathname();

  function handleNavClick() {
    onClose?.();
  }

  function handleLogoutClick() {
    onLogout?.();
    onClose?.();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        className={cn(
          "fixed inset-0 z-40 bg-black/45 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-[min(20rem,88vw)] flex-col bg-primary-800 text-white transition-transform duration-300 lg:static lg:z-auto lg:h-full lg:w-64 lg:shrink-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/75">
              <HeartPulse className="h-4 w-4" strokeWidth={2} />
            </div>
            <span className="font-heading text-xl tracking-tight text-white">
              ClaudMD
            </span>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3">
          {items.map((item) => {
            const Icon = icons[item.icon];
            const active = pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary-700 text-white"
                    : "text-white/75 hover:bg-primary-700/50 hover:text-white"
                )}
              >
                {Icon ? <Icon className="h-4 w-4" /> : null}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto shrink-0 border-t border-white/10 px-3 py-4">
          <Link
            href={loginHref}
            onClick={handleLogoutClick}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Log Out
          </Link>
        </div>
      </aside>
    </>
  );
}
