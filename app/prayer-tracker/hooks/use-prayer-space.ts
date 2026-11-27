import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api";
import type { AppwriteUser, Family, Member, UnifiedRequest } from "../types";

export type UsePrayerSpaceOptions = {
  user: AppwriteUser | null;
  authLoading: boolean;
};

type SpaceLoadState = {
  userId: string | null;
  ready: boolean;
};

export function usePrayerSpace({ user, authLoading }: UsePrayerSpaceOptions) {
  const [spaceName, setSpaceName] = useState<string | null>();
  const [spaceLoadState, setSpaceLoadState] = useState<SpaceLoadState>({ userId: null, ready: false });
  const [members, setMembers] = useState<Member[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [requests, setRequests] = useState<UnifiedRequest[]>([]);
  const initializedForUser = useRef<string | null>(null);

  const markSpaceLoading = useCallback((userId: string) => {
    setSpaceLoadState({ userId, ready: false });
  }, []);

  const markSpaceReady = useCallback((userId: string) => {
    setSpaceLoadState({ userId, ready: true });
  }, []);

  const loadSpace = useCallback(async () => {
    const userId = initializedForUser.current;
    const result = await api.fetchSpace();

    if (!result.success || initializedForUser.current !== userId) return false;
    setSpaceName(result.data?.spaceName ?? null);
    setMembers(result.data?.members ?? []);
    return true;
  }, []);

  const refreshLists = useCallback(async () => {
    const userId = initializedForUser.current;
    const [familiesResult, requestsResult] = await Promise.all([
      api.fetchFamilies(),
      api.fetchUnifiedRequests(),
    ]);

    if (initializedForUser.current !== userId) return false;
    if (familiesResult.success) {
      setFamilies(familiesResult.data);
    }

    if (requestsResult.success) {
      setRequests(requestsResult.data);
    }
    return familiesResult.success && requestsResult.success;
  }, []);

  const refreshAll = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) markSpaceLoading(user?.$id ?? "");
      try {
        const [spaceLoaded, listsLoaded] = await Promise.all([loadSpace(), refreshLists()]);
        return spaceLoaded && listsLoaded;
      } finally {
        if (!silent && user && initializedForUser.current === user.$id) markSpaceReady(user.$id);
      }
    },
    [loadSpace, markSpaceLoading, markSpaceReady, refreshLists, user]
  );

  useEffect(() => {
    if (authLoading) return;

    const userId = user?.$id ?? null;
    if (initializedForUser.current === userId) return;
    initializedForUser.current = userId;
    setSpaceName(undefined);
    setMembers([]);
    setFamilies([]);
    setRequests([]);
    if (!user) {
      setSpaceLoadState({ userId: null, ready: false });
      return;
    }

    (async () => {
      try {
        await refreshAll();
      } catch (error) {
        console.error("Failed to load prayer tracker data", error);
      }
    })();
  }, [authLoading, refreshAll, user]);

  const isCurrentUserSpaceLoaded = useMemo(() => {
    if (!user) return false;
    return Boolean(spaceLoadState.ready && spaceLoadState.userId === user.$id);
  }, [spaceLoadState.ready, spaceLoadState.userId, user]);

  const updateMembers = useCallback((nextMembers: Member[]) => {
    setMembers(nextMembers);
  }, []);

  return {
    spaceName,
    members,
    families,
    requests,
    refreshAll,
    refreshLists,
    updateMembers,
    isCurrentUserSpaceLoaded,
  };
}
