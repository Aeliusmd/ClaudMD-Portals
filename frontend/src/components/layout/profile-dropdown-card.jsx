"use client";

import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";
import { LOGIN_PATH } from "@/lib/auth-routes";
import { patientPaths } from "@/lib/portal-paths";
import { cn } from "@/lib/utils";

export function ProfileMenuItem({ href, icon: Icon, label, tone = "default", onClick }) {
  const isDanger = tone === "danger";
  const className = cn(
    "flex w-full items-center gap-3 px-4 py-2.5 text-left font-sans text-sm font-medium transition",
    isDanger
      ? "text-accent-600 hover:bg-accent-50"
      : "text-foreground-700 hover:bg-background-100"
  );

  const content = (
    <>
      <Icon className={cn("h-4 w-4 shrink-0", isDanger && "text-accent-600")} />
      {label}
    </>
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

export function ProfileDropdownCard({
  user,
  patient,
  profileHref = patientPaths.profile,
  settingsHref,
  onClose,
}) {
  const profileUser = user || patient;
  const resolvedSettingsHref = settingsHref || profileHref;

  return (
    <div
      role="menu"
      aria-label="Profile menu"
      className="absolute top-[calc(100%+0.65rem)] right-0 z-50 w-[15.5rem] overflow-hidden rounded-2xl border border-[#ece7df] bg-white shadow-[0_12px_40px_rgba(28,36,48,0.12)]"
    >
      <div className="px-4 py-3.5">
        <p className="font-sans text-sm font-semibold text-[#1c1917]">
          {profileUser.fullName}
        </p>
        <p className="mt-0.5 font-sans text-xs font-normal text-[#9aa0a8]">
          {profileUser.title || profileUser.role}
        </p>
      </div>

      <div className="border-t border-[#f0ebe3] py-1.5">
        <ProfileMenuItem
          href={profileHref}
          icon={UserRound}
          label="Profile"
          onClick={onClose}
        />
        <ProfileMenuItem
          href={resolvedSettingsHref}
          icon={Settings}
          label="Settings"
          onClick={onClose}
        />
      </div>

      <div className="border-t border-[#f0ebe3] py-1.5">
        <ProfileMenuItem
          href={LOGIN_PATH}
          icon={LogOut}
          label="Log Out"
          tone="danger"
          onClick={onClose}
        />
      </div>
    </div>
  );
}
