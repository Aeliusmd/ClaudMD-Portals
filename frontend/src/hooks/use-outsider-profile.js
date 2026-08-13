"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchOutsiderProfile } from "@/lib/api/outsider";
import { getAccessToken } from "@/lib/auth-session";
import { outsiderPaths } from "@/lib/portal-paths";

export function useOutsiderProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getAccessToken();
      if (!token) {
        router.replace(outsiderPaths.login);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchOutsiderProfile(token);
        if (cancelled) return;
        setProfile(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401 || err?.status === 403) {
          router.replace(outsiderPaths.login);
          return;
        }
        setError(err?.message || "Unable to load profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { profile, loading, error };
}
