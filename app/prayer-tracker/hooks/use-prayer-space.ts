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
  const [spaceName, setSpaceName] = useState<string | null>(null);
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
    const result = await api.fetchSpace();

    if (result.success && result.data) {
      setSpaceName(result.data.spaceName);
      setMembers(result.data.members);
      return result.data;
    }

    setSpaceName(null);
    setMembers([]);
    return null;
  }, []);

  const refreshLists = useCallback(async () => {
    const [familiesResult, requestsResult] = await Promise.all([
      api.fetchFamilies(),
      api.fetchUnifiedRequests(),
    ]);

    if (familiesResult.success) {
      setFamilies(familiesResult.data);
    }

    if (requestsResult.success) {
      setRequests(requestsResult.data);
    }
  }, []);

  const refreshAll = useCallback(
    async () => {
      markSpaceLoading(user?.$id ?? "");
      try {
        await Promise.all([loadSpace(), refreshLists()]);
      } finally {
        markSpaceReady(user?.$id ?? "");
      }
    },
    [loadSpace, markSpaceLoading, markSpaceReady, refreshLists, user]
  );

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      initializedForUser.current = null;
      setSpaceName(null);
      setMembers([]);
      setFamilies([]);
      setRequests([]);
      setSpaceLoadState({ userId: null, ready: false });
      return;
    }

    if (initializedForUser.current === user.$id) return;
    initializedForUser.current = user.$id;

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
