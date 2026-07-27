"use client";

import { useState } from "react";
import { Check, Lock, Shield, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  currentEmployer,
  employerAccountPermissions,
} from "@/data/employer";
import { cn } from "@/lib/utils";

const profileTabs = [
  { id: "profile", label: "Profile Info", icon: UserRound },
  { id: "security", label: "Security", icon: Shield },
  { id: "permissions", label: "Permissions", icon: Lock },
];

function ProfileTabBar({ value, onChange }) {
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {profileTabs.map((item) => {
        const Icon = item.icon;
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors",
              active
                ? "bg-primary text-white shadow-sm"
                : "bg-cream-deep text-ink hover:bg-border"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function ProfileField({ id, label, value, type = "text" }) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase">
        {label}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        readOnly
        className="w-full rounded-xl border border-transparent bg-cream-deep/80 px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
      />
    </label>
  );
}

function PasswordField({ id, label, placeholder }) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase">
        {label}
      </span>
      <input
        id={id}
        type="password"
        readOnly
        placeholder={placeholder}
        className="w-full rounded-xl border border-transparent bg-[#faf6f0] px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-muted/80"
      />
    </label>
  );
}

export function EmployerProfileView() {
  const [tab, setTab] = useState("profile");

  return (
    <div>
      <PageHeader title="Profile / Security" className="mb-5" />
      <ProfileTabBar value={tab} onChange={setTab} />

      {tab === "profile" ? (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-5 text-lg font-semibold text-ink">
            Organization Profile
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <ProfileField
              id="employer-full-name"
              label="Full Name"
              value={currentEmployer.fullName}
            />
            <ProfileField
              id="employer-title"
              label="Title"
              value={currentEmployer.title}
            />
            <ProfileField
              id="employer-email"
              label="Email"
              value={currentEmployer.email}
            />
            <ProfileField
              id="employer-phone"
              label="Phone"
              value={currentEmployer.phone}
            />
            <div className="md:col-span-2">
              <ProfileField
                id="employer-organization"
                label="Organization"
                value={currentEmployer.organization}
              />
            </div>
            <div className="md:col-span-2">
              <ProfileField
                id="employer-address"
                label="Address"
                value={currentEmployer.address}
              />
            </div>
          </div>
        </Card>
      ) : null}

      {tab === "security" ? (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-5 text-lg font-semibold text-ink">
            Change Password
          </h2>
          <div className="max-w-xl space-y-4">
            <PasswordField
              id="current-password"
              label="Current Password"
              placeholder="Enter current password"
            />
            <PasswordField
              id="new-password"
              label="New Password"
              placeholder="Enter new password"
            />
            <PasswordField
              id="confirm-password"
              label="Confirm New Password"
              placeholder="Confirm new password"
            />
          </div>
          <p className="mt-8 text-center text-sm text-muted">
            Contact your system administrator to update your password.
          </p>
        </Card>
      ) : null}

      {tab === "permissions" ? (
        <Card className="overflow-hidden p-0">
          <div className="p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-ink">
              Account Permissions
            </h2>
            <ul className="mt-5 space-y-4">
              {employerAccountPermissions.map((permission) => (
                <li key={permission} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-primary">
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                  <span className="text-sm font-medium text-ink">
                    {permission}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t border-border/60 bg-cream-deep/70 px-5 py-3.5 sm:px-6">
            <p className="text-sm font-medium text-ink">
              Account ID:{" "}
              <span className="font-semibold">{currentEmployer.accountId}</span>
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
