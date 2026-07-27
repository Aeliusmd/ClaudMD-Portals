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
        className="flex cursor-pointer items-center gap-2 rounded-full py-1 pr-2 pl-1 transition hover:bg-cream-deep"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
          <UserRound className="h-4 w-4" />
        </span>
        <span className="hidden text-left lg:block">
          <span className="block text-sm font-semibold text-ink">
            {user.fullName}
          </span>
          <span className="block text-xs text-muted">
            {user.title || user.role}
          </span>
        </span>
        <ChevronDown
          className={`hidden h-4 w-4 text-muted transition lg:block ${
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
