"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchEmployerProfile } from "@/lib/api/employer";
import { getAccessToken } from "@/lib/auth-session";
import { LOGIN_PATH } from "@/lib/auth-routes";

let cachedProfile = null;
let cachedToken = null;
let inflightPromise = null;
const listeners = new Set();

function notifyProfileListeners(nextProfile) {
  listeners.forEach((listener) => listener(nextProfile));
}

export function clearEmployerProfileCache() {
  cachedProfile = null;
  cachedToken = null;
  inflightPromise = null;
  notifyProfileListeners(null);
}

// Drop stale in-memory profile cache after profile-field shape changes.
clearEmployerProfileCache();

export function useEmployerProfile() {
  const router = useRouter();
  // Always start equal on server + client to avoid hydration mismatches.
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
    listeners.add(onCacheChange);
    return () => {
      listeners.delete(onCacheChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const token = getAccessToken();
      if (!token) {
        router.replace(LOGIN_PATH);
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
          inflightPromise = fetchEmployerProfile(token);
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
        if (err?.status === 401) {
          cachedProfile = null;
          cachedToken = null;
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
  }, [router, cacheVersion]);

  function setCachedProfile(next) {
    cachedProfile = next;
    cachedToken = getAccessToken();
    // Resolve waiters to the saved profile so in-flight GETs cannot overwrite it.
    inflightPromise = Promise.resolve(next);
    setProfile(next);
    notifyProfileListeners(next);
  }

  return { profile, loading, error, setCachedProfile };
}
