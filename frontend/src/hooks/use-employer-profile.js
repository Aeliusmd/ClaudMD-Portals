"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchEmployerProfile } from "@/lib/api/employer";
import { getAccessToken } from "@/lib/auth-session";
import { LOGIN_PATH } from "@/lib/auth-routes";

export function useEmployerProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const token = getAccessToken();
      if (!token) {
        router.replace(LOGIN_PATH);
        return;
      }

      try {
        const data = await fetchEmployerProfile(token);
        if (!cancelled) {
          setProfile(data);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(LOGIN_PATH);
          return;
        }
        setError(err?.message || "Unable to load profile.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return { profile, loading, error };
}
