"use client";

import { Menu, Search } from "lucide-react";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { ProfileMenu } from "@/components/layout/profile-menu";
import { patientPaths } from "@/lib/portal-paths";
import { cn } from "@/lib/utils";

export function TopBar({
  onMenuClick,
  portalLabel = "Patient Portal",
  organizationLabel,
  profileUser,
  profileHref = patientPaths.profile,
  settingsHref,
  loginHref,
  notifications,
  notificationsViewAllHref,
  onNotificationsOpen,
  notificationsTotalCount,
  notificationsUnreadCount,
  showSearch = true,
  className,
}) {
  return (
    <header
      className={cn(
        "flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[#ece7df] px-3 sm:gap-4 sm:px-5 lg:px-6",
        showSearch ? "bg-cream" : "bg-white",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={onMenuClick}
          className="cursor-pointer rounded-lg p-2 text-ink transition hover:bg-cream-deep lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <p className="truncate text-sm text-[#6b7280]">
          {portalLabel}
          {organizationLabel ? (
            <>
              {" "}
              <span className="font-bold tracking-wide text-ink uppercase">
                {organizationLabel}
              </span>
            </>
          ) : null}
        </p>
      </div>

      {showSearch ? (
        <div className="hidden max-w-md flex-1 md:block">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              placeholder="Search..."
              className="w-full rounded-full border border-transparent bg-cream-deep py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-muted focus:border-primary/30 focus:bg-white"
            />
          </label>
        </div>
      ) : (
        <div className="min-w-0 flex-1" />
      )}

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <NotificationsMenu
          items={notifications}
          variant={showSearch ? "soft" : "ghost"}
          viewAllHref={notificationsViewAllHref}
          onOpen={onNotificationsOpen}
          totalCount={notificationsTotalCount}
          unreadCount={notificationsUnreadCount}
        />
        <span className="hidden text-sm text-[#9ca3af] sm:inline">Welcome</span>
        <ProfileMenu
          user={profileUser}
          profileHref={profileHref}
          settingsHref={settingsHref}
          loginHref={loginHref}
        />
      </div>
    </header>
  );
}
