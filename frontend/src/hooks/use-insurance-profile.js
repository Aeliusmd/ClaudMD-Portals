"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchInsuranceProfile } from "@/lib/api/insurance";
import { getAccessToken } from "@/lib/auth-session";
import { insurancePaths } from "@/lib/portal-paths";

let cachedProfile = null;
let cachedToken = null;
let inflightPromise = null;

export function clearInsuranceProfileCache() {
  cachedProfile = null;
  cachedToken = null;
  inflightPromise = null;
}

export function useInsuranceProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const token = getAccessToken();
      if (!token) {
        router.replace(insurancePaths.login);
        return;
      }

      if (cachedProfile && cachedToken === token) {
        if (!cancelled) {
          setProfile(cachedProfile);
          setLoading(false);
          setError(null);
        }
        return;
      }

      if (!cancelled) setLoading(true);

      try {
        if (!inflightPromise || cachedToken !== token) {
          cachedToken = token;
          inflightPromise = fetchInsuranceProfile(token);
        }
        const data = await inflightPromise;
        cachedProfile = data;
        if (!cancelled) {
          setProfile(data);
          setError(null);
        }
      } catch (err) {
        inflightPromise = null;
        if (cancelled) return;
        if (err?.status === 401) {
          cachedProfile = null;
          cachedToken = null;
          router.replace(insurancePaths.login);
          return;
        }
        setError(err?.message || "Unable to load profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { profile, loading, error };
}
