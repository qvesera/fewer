"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./use-auth";

export interface Profile {
  first_name: string;
  last_name: string;
  username: string;
}

const EMPTY_PROFILE: Profile = { first_name: "", last_name: "", username: "" };

/**
 * Loads the signed-in user's profile (first/last name, username) from
 * `/api/profile`. Returns an empty profile while signed out or loading.
 */
export function useProfile(): Profile {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);

  useEffect(() => {
    if (!user) {
      setProfile(EMPTY_PROFILE);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/profile");
        const json = await res.json();
        if (mounted && json.profile) {
          const p = json.profile as { first_name?: unknown; last_name?: unknown; username?: unknown };
          setProfile({
            first_name: typeof p.first_name === "string" ? p.first_name : "",
            last_name: typeof p.last_name === "string" ? p.last_name : "",
            username: typeof p.username === "string" ? p.username : "",
          });
        }
      } catch {
        /* ignore — fall back to email */
      }
    })();
    return () => {
      mounted = false;
    };
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