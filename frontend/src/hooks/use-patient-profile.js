"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchPatientProfile } from "@/lib/api/patient";
import { getAccessToken } from "@/lib/auth-session";
import { patientPaths } from "@/lib/portal-paths";

let cachedProfile = null;
let cachedToken = null;
let inflightPromise = null;
const listeners = new Set();

function notifyProfileListeners(nextProfile) {
  listeners.forEach((listener) => listener(nextProfile));
}

export function clearPatientProfileCache() {
  cachedProfile = null;
  cachedToken = null;
  inflightPromise = null;
  notifyProfileListeners(null);
}

// Drop stale in-memory profile cache after profile-field shape changes.
clearPatientProfileCache();

export function usePatientProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => {
    const onCacheChange = (nextProfile) => {
      if (nextProfile) {
        setProfile(nextProfile);
        setLoading(false);
        setError(null);
        return;
      }
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
        router.replace(patientPaths.login);
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
          inflightPromise = fetchPatientProfile(token);
        }
        const request = inflightPromise;
        const data = await request;
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
          router.replace(patientPaths.login);
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
    inflightPromise = Promise.resolve(next);
    setProfile(next);
    notifyProfileListeners(next);
  }

  return { profile, loading, error, setCachedProfile };
}
