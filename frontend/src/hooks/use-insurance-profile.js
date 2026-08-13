"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchInsuranceProfile } from "@/lib/api/insurance";
import { getAccessToken, updateAuthSessionUser } from "@/lib/auth-session";
import { insurancePaths } from "@/lib/portal-paths";
import { displayFullName } from "@/lib/profile-display";

const PROFILE_CACHE_EVENT = "claudmd-insurance-profile-cache";

let cachedProfile = null;
let cachedToken = null;
let inflightPromise = null;
const listeners = new Set();

function notifyProfileListeners(nextProfile) {
  listeners.forEach((listener) => listener(nextProfile));
}

export function clearInsuranceProfileCache() {
  cachedProfile = null;
  cachedToken = null;
  inflightPromise = null;
  notifyProfileListeners(null);
}

// Drop stale in-memory profile cache after profile-field shape changes.
clearInsuranceProfileCache();

export function useInsuranceProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => {
    const onCacheChange = (nextProfile) => {
      if (nextProfile) {
        // Immediate push from setCachedProfile — update header without refetch.
        setProfile(nextProfile);
        setLoading(false);
        setError(null);
        return;
      }
      // Cache cleared — force reload.
      setCacheVersion((version) => version + 1);
    };
    const onWindowCache = (event) => {
      onCacheChange(event?.detail ?? null);
    };
    listeners.add(onCacheChange);
    window.addEventListener(PROFILE_CACHE_EVENT, onWindowCache);
    return () => {
      listeners.delete(onCacheChange);
      window.removeEventListener(PROFILE_CACHE_EVENT, onWindowCache);
    };
  }, []);

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
        const request = inflightPromise;
        const data = await request;
        // Ignore stale responses superseded by setCachedProfile / a newer fetch.
        if (inflightPromise !== request && cachedProfile && cachedToken === token) {
          if (!cancelled) {
            setProfile(cachedProfile);
            setError(null);
          }
          return;
        }
        cachedProfile = data;
        if (!cancelled) {
          setProfile(data);
          setError(null);
        }
      } catch (err) {
        if (inflightPromise) {
          inflightPromise = null;
        }
        if (cancelled) return;
        if (err?.status === 401 || err?.status === 403) {
          cachedProfile = null;
          cachedToken = null;
          router.replace(insurancePaths.login);
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
  }, [router, cacheVersion]);

  function setCachedProfile(next) {
    const withName = {
      ...next,
      fullName: displayFullName(next) || next?.fullName || "",
    };
    cachedProfile = withName;
    cachedToken = getAccessToken();
    inflightPromise = Promise.resolve(withName);
    setProfile(withName);
    notifyProfileListeners(withName);
    updateAuthSessionUser(withName);
    window.dispatchEvent(
      new CustomEvent(PROFILE_CACHE_EVENT, { detail: withName })
    );
  }

  return { profile, loading, error, setCachedProfile };
}
