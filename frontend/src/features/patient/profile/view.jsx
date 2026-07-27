"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { ToggleRow } from "@/components/ui/toggle-row";
import { currentPatient } from "@/data/patient";

const tabs = [
  { id: "profile", label: "Profile Info" },
  { id: "security", label: "Security" },
  { id: "notifications", label: "Notifications" },
];

export function PatientProfileView() {
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState({
    fullName: currentPatient.fullName,
    dateOfBirth: currentPatient.dateOfBirth,
    email: currentPatient.email,
    phone: currentPatient.phone,
    address: currentPatient.address,
  });
  const [notifications, setNotifications] = useState(
    currentPatient.notifications
  );
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [message, setMessage] = useState("");

  function updateProfileField(field, value) {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }

  function toggleNotification(field) {
    setNotifications((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  return (
    <div>
      <PageHeader title="Profile / Security" />
      <Tabs items={tabs} value={tab} onChange={setTab} className="mb-5" />

      {message ? (
        <p className="mb-4 text-sm font-medium text-emerald-700">{message}</p>
      ) : null}

      {tab === "profile" ? (
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold text-ink">
            Personal Information
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              id="fullName"
              label="Full Name"
              value={profile.fullName}
              onChange={(e) => updateProfileField("fullName", e.target.value)}
            />
            <Input
              id="dateOfBirth"
              label="Date of Birth"
              value={profile.dateOfBirth}
              onChange={(e) =>
                updateProfileField("dateOfBirth", e.target.value)
              }
            />
            <Input
              id="email"
              label="Email"
              value={profile.email}
              onChange={(e) => updateProfileField("email", e.target.value)}
            />
            <Input
              id="phone"
              label="Phone"
              value={profile.phone}
              onChange={(e) => updateProfileField("phone", e.target.value)}
            />
            <div className="md:col-span-2">
              <Input
                id="address"
                label="Address"
                value={profile.address}
                onChange={(e) => updateProfileField("address", e.target.value)}
              />
            </div>
          </div>
          <Button
            className="mt-5"
            onClick={() => setMessage("Profile changes saved (demo only).")}
          >
            Save Changes
          </Button>
        </Card>
      ) : null}

      {tab === "security" ? (
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold text-ink">
            Change Password
          </h2>
          <div className="grid max-w-xl gap-4">
            <Input
              id="currentPassword"
              label="Current Password"
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) =>
                setPasswordForm((prev) => ({
                  ...prev,
                  currentPassword: e.target.value,
                }))
              }
            />
            <Input
              id="newPassword"
              label="New Password"
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) =>
                setPasswordForm((prev) => ({
                  ...prev,
                  newPassword: e.target.value,
                }))
              }
            />
            <Input
              id="confirmPassword"
              label="Confirm New Password"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm((prev) => ({
                  ...prev,
                  confirmPassword: e.target.value,
                }))
              }
            />
          </div>
          <Button
            className="mt-5"
            onClick={() =>
              setMessage("Password update saved locally (demo only).")
            }
          >
            Update Password
          </Button>
        </Card>
      ) : null}

      {tab === "notifications" ? (
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold text-ink">
            Notification Preferences
          </h2>
          <div className="space-y-4">
            <ToggleRow
              title="Appointment reminders"
              description="Receive email reminders before upcoming appointments"
              checked={notifications.appointmentReminders}
              onChange={() => toggleNotification("appointmentReminders")}
            />
            <ToggleRow
              title="New document shared"
              description="Get notified when a new report or document is shared"
              checked={notifications.newDocumentShared}
              onChange={() => toggleNotification("newDocumentShared")}
            />
            <ToggleRow
              title="Visit updates"
              description="Receive updates about your visit status and results"
              checked={notifications.visitUpdates}
              onChange={() => toggleNotification("visitUpdates")}
            />
            <ToggleRow
              title="Marketing & newsletters"
              description="Receive health tips and platform updates"
              checked={notifications.marketing}
              onChange={() => toggleNotification("marketing")}
            />
          </div>
          <Button
            className="mt-5"
            onClick={() =>
              setMessage("Notification preferences saved (demo only).")
            }
          >
            Save Preferences
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
