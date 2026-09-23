"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./use-auth";

export interface Profile {
  first_name: string;
  last_name: string;
  username: string;
  /** Account plan — read-only mirror of profiles.plan ("team" reports as "pro"). */
  plan: "free" | "pro";
}

const EMPTY_PROFILE: Profile = { first_name: "", last_name: "", username: "", plan: "free" };

// ── Session cache: one /api/profile fetch per user, shared across call sites ──
// ponytail: avoids 3 parallel /api/profile requests from FewerApp + GlobalNavbar + ThemeEditorDialog.
let _cachedProfile: Profile | null = null;
let _cachedUserId: string | null = null;
let _fetching: Promise<Profile | null> | null = null;

function fetchProfileOnce(uid: string): Promise<Profile | null> {
  if (_cachedUserId === uid && _cachedProfile) return Promise.resolve(_cachedProfile);
  if (_fetching) return _fetching;
  _fetching = (async () => {
    try {
      const res = await fetch("/api/profile");
      const json = await res.json();
      if (json.profile) {
        const p = json.profile as Record<string, unknown>;
        const parsed: Profile = {
          first_name: typeof p.first_name === "string" ? p.first_name : "",
          last_name: typeof p.last_name === "string" ? p.last_name : "",
          username: typeof p.username === "string" ? p.username : "",
          plan: p.plan === "pro" || p.plan === "team" ? "pro" : "free",
        };
        _cachedProfile = parsed;
        _cachedUserId = uid;
        return parsed;
      }
    } catch {
      /* ignore — fall back to empty profile */
    }
    return null;
  })();
  // Clear the in-flight promise so the next call re-fetches if this one fails.
  return _fetching.then((p) => { _fetching = null; return p; });
}

/**
 * Loads the signed-in user's profile (first/last name, username) from
 * `/api/profile`. Returns an empty profile while signed out or loading.
 * Module-level cache ensures a single fetch per user across call sites.
 */
export function useProfile(): Profile {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile>(_cachedProfile ?? EMPTY_PROFILE);

  useEffect(() => {
    if (!user) {
      setProfile(EMPTY_PROFILE);
      _cachedProfile = null;
      _cachedUserId = null;
      return;
    }
    let mounted = true;
    fetchProfileOnce(user.id).then((p) => {
      if (mounted && p) setProfile(p);
    });
    return () => { mounted = false; };
  }, [user?.id]);

  return profile;
}

/**
 * Best display name for showing near the user's avatar, in priority order:
 *   1. first name (plus last name when present)
 *   2. username
 *   3. email address (last resort)
 */
export function userDisplayName(
  profile: Profile,
  user: { email?: string | null } | null,
): string {
  if (profile.first_name) {
    return profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.first_name;
  }
  if (profile.username) return profile.username;
  return user?.email ?? "";
}

/** Initials from a display name or email. "Ada Lovelace" → "AL", "ada@example.com" → "A", empty → "?" */
export function initialsOf(displayName: string): string {
  const s = displayName.trim();
  if (!s) return "?";
  if (s.includes("@")) return s[0].toUpperCase();
  const parts = s.split(/\s+/);
  return parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}