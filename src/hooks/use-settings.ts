"use client";

import { useEffect, useRef } from "react";
import { useGraphStore } from "@/store/graphStore";
import { useAuth } from "./use-auth";
import {
  captureUserSettings,
  applyUserSettings,
  settingsChanged,
  saveSettingsLocal,
  loadSettingsLocal,
} from "@/lib/fewer/userSettings";

/**
 * Persists the user's app settings. Apply local settings on load (so signed-out
 * users and offline keep their preferences); when a signed-in user resolves,
 * fetch their cloud settings and apply them (cloud wins). Debounces saves of any
 * settings change to localStorage and, when signed in, to `/api/settings`.
 */
export function useSettingsSync() {
  const { user } = useAuth();
  const readyRef = useRef(false);
  const uidRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    uidRef.current = user?.id ?? null;
  }, [user]);

  // Apply locally-persisted settings immediately on mount.
  useEffect(() => {
    const local = loadSettingsLocal();
    if (local) applyUserSettings(local);
    readyRef.current = true;
  }, []);

  // Debounced persist of any user-settings change.
  useEffect(() => {
    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const settings = captureUserSettings();
        saveSettingsLocal(settings);
        if (uidRef.current) {
          fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ settings }),
          }).catch(() => { /* non-dev / offline */ });
        }
      }, 1200);
    };

    const unsub = useGraphStore.subscribe((state, prev) => {
      if (!readyRef.current) return; // ignore the initial local/cloud apply
      if (settingsChanged(prev as never, state as never)) schedule();
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      unsub();
    };
  }, []);

  // When the signed-in user resolves or changes, load their cloud settings.
  useEffect(() => {
    if (!user) {
      readyRef.current = true;
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/settings");
        const json = await res.json();
        if (json.settings) {
          readyRef.current = false; // suppress echoing the loaded values back
          applyUserSettings(json.settings);
          saveSettingsLocal(captureUserSettings());
        }
      } catch {
        /* ignore */
      } finally {
        readyRef.current = true;
      }
    })();
  }, [user?.id]);
}
