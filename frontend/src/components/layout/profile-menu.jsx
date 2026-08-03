"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import { ProfileDropdownCard } from "@/components/layout/profile-dropdown-card";
import { currentPatient } from "@/data/patient";

export function ProfileMenu({
  user = currentPatient,
  profileHref = "/patient/profile",
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Profile menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
        className="flex cursor-pointer items-center gap-2 rounded-full py-1 pr-1.5 pl-1 transition hover:bg-cream-deep sm:gap-2.5 sm:pr-2"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dbeafe] text-primary">
            <UserRound className="h-4 w-4" />
          </span>
        )}
        <span className="hidden min-w-0 text-left md:block">
          <span className="block truncate text-sm font-semibold text-ink">
            {user.fullName}
          </span>
          <span className="block truncate text-xs text-[#9ca3af]">
            {user.title || user.role}
          </span>
        </span>
        <ChevronDown
          className={`hidden h-4 w-4 shrink-0 text-[#9ca3af] transition md:block ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <ProfileDropdownCard
          user={user}
          profileHref={profileHref}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
