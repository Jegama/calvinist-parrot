"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type QueryKey = readonly unknown[] | string;

type QueryState<TData = unknown> = {
  data: TData | undefined;
  error: unknown;
  status: "idle" | "loading" | "success" | "error";
  updatedAt: number;
};

type Listener = () => void;

type QueryOptions = {
  staleTime?: number;
};

type DefaultOptions = {
  queries?: QueryOptions;
};

type QueryClientConfig = {
  defaultOptions?: DefaultOptions;
};

function hashKey(key: QueryKey): string {
  if (Array.isArray(key)) {
    return JSON.stringify(key);
  }
  return String(key);
}

function createInitialState<TData>(data?: TData): QueryState<TData> {
  return {
    data,
    error: undefined,
    status: data === undefined ? "idle" : "success",
    updatedAt: data === undefined ? 0 : Date.now(),
  };
}

class QueryClient {
  private store = new Map<string, QueryState>();

  private listeners = new Map<string, Set<Listener>>();

  readonly defaultOptions: DefaultOptions;

  constructor(config?: QueryClientConfig) {
    this.defaultOptions = config?.defaultOptions ?? {};
  }

  private ensureState<TData>(queryKey: QueryKey): QueryState<TData> {
    const hash = hashKey(queryKey);
    if (!this.store.has(hash)) {
      const initial = createInitialState<TData>();
      this.store.set(hash, initial);
    }
    return this.store.get(hash)! as QueryState<TData>;
  }

  getQueryState<TData>(queryKey: QueryKey): QueryState<TData> {
    return this.ensureState<TData>(queryKey);
  }

  getQueryData<TData>(queryKey: QueryKey): TData | undefined {
    return this.ensureState<TData>(queryKey).data;
  }

  setQueryData<TData>(
    queryKey: QueryKey,
    updater: TData | ((oldData: TData | undefined) => TData),
  ) {
    const hash = hashKey(queryKey);
    const previous = this.ensureState<TData>(queryKey);
    const nextData =
      typeof updater === "function"
        ? (updater as (old: TData | undefined) => TData)(previous.data as TData | undefined)
        : updater;

    const nextState: QueryState<TData> = {
      data: nextData,
      error: undefined,
      status: "success",
      updatedAt: Date.now(),
    };

    this.store.set(hash, nextState as QueryState);
    this.notify(queryKey);
  }

  private setState<TData>(queryKey: QueryKey, state: QueryState<TData>) {
    const hash = hashKey(queryKey);
    this.store.set(hash, state as QueryState);
    this.notify(queryKey);
  }

  async fetchQuery<TData>(
    queryKey: QueryKey,
    queryFn: () => Promise<TData>,
  ): Promise<TData> {
    const current = this.ensureState<TData>(queryKey);
    this.setState(queryKey, { ...current, status: "loading" });

    try {
      const data = await queryFn();
      this.setState<TData>(queryKey, {
        data,
        error: undefined,
        status: "success",
        updatedAt: Date.now(),
      });
      return data;
    } catch (error) {
      this.setState<TData>(queryKey, {
        data: current.data,
        error,
        status: "error",
        updatedAt: current.updatedAt,
      });
      throw error;
    }
  }

  invalidateQueries(queryKey?: QueryKey) {
    if (queryKey) {
      const state = this.ensureState(queryKey);
      this.setState(queryKey, { ...state, status: "idle", updatedAt: 0 });
      return;
    }

    for (const [hash, state] of this.store.entries()) {
      this.store.set(hash, { ...state, status: "idle", updatedAt: 0 });
    }

    for (const key of this.listeners.keys()) {
      this.notify(key);
    }
  }

  private notify(queryKey: QueryKey) {
    const hash = hashKey(queryKey);
    const listeners = this.listeners.get(hash);
    if (!listeners) return;
    for (const listener of listeners) {
      listener();
    }
  }

  subscribe(queryKey: QueryKey, listener: Listener) {
    const hash = hashKey(queryKey);
    const listeners = this.listeners.get(hash) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(hash, listeners);

    return () => {
      const set = this.listeners.get(hash);
      if (!set) return;
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(hash);
      }
    };
  }
}

type QueryContextValue = QueryClient;

const QueryClientContext = createContext<QueryContextValue | null>(null);

export function QueryClientProvider({
  client,
  children,
}: {
  client: QueryClient;
  children: ReactNode;
}) {
  return (
    <QueryClientContext.Provider value={client}>
      {children}
    </QueryClientContext.Provider>
  );
}

export function useQueryClient(): QueryClient {
  const context = useContext(QueryClientContext);
  if (!context) {
    throw new Error("useQueryClient must be used within a QueryClientProvider");
  }
  return context;
}

type UseQueryOptions<TData> = {
  queryKey: QueryKey;
  queryFn: () => Promise<TData>;
  enabled?: boolean;
  staleTime?: number;
};

type UseQueryResult<TData> = QueryState<TData> & {
  refetch: () => Promise<TData>;
};

export function useQuery<TData>(options: UseQueryOptions<TData>): UseQueryResult<TData> {
  const client = useQueryClient();
  const { queryKey, queryFn, enabled = true } = options;
  const staleTime = options.staleTime ?? client.defaultOptions.queries?.staleTime ?? 0;
  const keyHash = useMemo(() => hashKey(queryKey), [queryKey]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => client.subscribe(keyHash, onStoreChange),
    [client, keyHash],
  );

  const getSnapshot = useCallback(() => client.getQueryState<TData>(keyHash), [client, keyHash]);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const latestQueryFn = useRef(queryFn);
  useEffect(() => {
    latestQueryFn.current = queryFn;
  }, [queryFn]);

  const refetch = useCallback(() => client.fetchQuery(queryKey, () => latestQueryFn.current()), [client, queryKey]);

  useEffect(() => {
    if (!enabled) return;
    const current = client.getQueryState<TData>(keyHash);
    const isStale = Date.now() - current.updatedAt > staleTime;
    if (current.status === "idle" || current.status === "error" || isStale) {
      void client.fetchQuery(queryKey, () => latestQueryFn.current());
    }
  }, [client, enabled, keyHash, queryKey, staleTime]);

  return useMemo(
    () => ({
      ...state,
      refetch,
    }),
    [state, refetch],
  );
}

type MutationState<TData, TError> = {
  data: TData | undefined;
  error: TError | undefined;
  status: "idle" | "pending" | "success" | "error";
};

type MutateOptions<TData, TVariables, TError> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: TError, variables: TVariables) => void;
  onSettled?: (data: TData | undefined, error: TError | undefined, variables: TVariables) => void;
};

type MutateCallbacks<TData, TVariables, TError> = {
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: TError, variables: TVariables) => void;
};

type UseMutationResult<TData, TVariables, TError> = MutationState<TData, TError> & {
  mutate: (variables: TVariables, callbacks?: MutateCallbacks<TData, TVariables, TError>) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
};

export function useMutation<TData = unknown, TVariables = void, TError = unknown>(
  options: MutateOptions<TData, TVariables, TError>,
): UseMutationResult<TData, TVariables, TError> {
  const { mutationFn, onError, onSuccess, onSettled } = options;
  const stateRef = useRef<MutationState<TData, TError>>({
    data: undefined,
    error: undefined,
    status: "idle",
  });
  const listeners = useRef(new Set<() => void>());

  const setState = useCallback((next: MutationState<TData, TError>) => {
    stateRef.current = next;
    listeners.current.forEach((listener) => listener());
  }, []);

  const mutateAsync = useCallback(
    async (variables: TVariables) => {
      setState({ data: stateRef.current.data, error: undefined, status: "pending" });
      try {
        const data = await mutationFn(variables);
        setState({ data, error: undefined, status: "success" });
        onSuccess?.(data, variables);
        onSettled?.(data, undefined, variables);
        return data;
      } catch (error) {
        setState({ data: stateRef.current.data, error: error as TError, status: "error" });
        onError?.(error as TError, variables);
        onSettled?.(undefined, error as TError, variables);
        throw error;
      }
    },
    [mutationFn, onError, onSettled, onSuccess, setState],
  );

  const mutate = useCallback(
    (variables: TVariables, callbacks?: MutateCallbacks<TData, TVariables, TError>) => {
      void mutateAsync(variables)
        .then((data) => {
          callbacks?.onSuccess?.(data, variables);
        })
        .catch((error: TError) => {
          callbacks?.onError?.(error, variables);
        });
    },
    [mutateAsync],
  );

  const subscribe = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const getSnapshot = useCallback(() => stateRef.current, []);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () => ({
      ...snapshot,
      mutate,
      mutateAsync,
    }),
    [mutate, mutateAsync, snapshot],
  );
}

export { QueryClient };
export type { QueryKey };
