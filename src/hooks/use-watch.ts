import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

export interface WatchedIndex {
  id: string;
  url: string;
  active: boolean;
  last_crawled_at: string | null;
  created_at: string;
}

/**
 * Manage the signed-in user's watched public file indexes.
 * Loads the list when the user changes; exposes add/remove helpers.
 */
export function useWatch() {
  const { user } = useAuth();
  const [watched, setWatched] = useState<WatchedIndex[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setWatched([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/watch");
      if (res.status === 401) {
        setWatched([]);
        return;
      }
      const json = await res.json();
      if (res.ok && Array.isArray(json.watched)) setWatched(json.watched);
    } catch {
      // ignore — list stays as-is
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(
    async (url: string): Promise<boolean> => {
      if (!user) return false;
      try {
        const res = await fetch("/api/watch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (!res.ok) return false;
        await load();
        return true;
      } catch {
        return false;
      }
    },
    [user, load]
  );

  const remove = useCallback(
    async (url: string): Promise<boolean> => {
      if (!user) return false;
      try {
        const res = await fetch(`/api/watch?url=${encodeURIComponent(url)}`, { method: "DELETE" });
        if (!res.ok) return false;
        setWatched((w) => w.filter((x) => x.url !== url));
        return true;
      } catch {
        return false;
      }
    },
    [user]
  );

  const isWatching = useCallback(
    (url: string) => watched.some((w) => w.url === url.trim()),
    [watched]
  );

  return { watched, loading, add, remove, isWatching, reload: load };
}