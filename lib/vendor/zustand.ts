"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

type StateCreator<T> = (
  set: (partial: Partial<T> | ((state: T) => Partial<T>)) => void,
  get: () => T,
) => T;

type Selector<T, U> = (state: T) => U;

type EqualityChecker<T> = (a: T, b: T) => boolean;

type Listener<T> = (state: T, prevState: T) => void;

type Subscribe<T> = (listener: Listener<T>) => () => void;

type StoreApi<T> = {
  setState: (partial: Partial<T> | ((state: T) => Partial<T>)) => void;
  getState: () => T;
  subscribe: Subscribe<T>;
};

type StoreHook<T> = {
  (): T;
  <U>(selector: Selector<T, U>, equalityFn?: EqualityChecker<U>): U;
  setState: StoreApi<T>["setState"];
  getState: StoreApi<T>["getState"];
  subscribe: StoreApi<T>["subscribe"];
};

function defaultEquality<T>(a: T, b: T) {
  return Object.is(a, b);
}

export default function create<T>(initializer: StateCreator<T>): StoreHook<T> {
  let state: T | undefined;
  const listeners = new Set<Listener<T>>();

  const setState: StoreApi<T>["setState"] = (partial) => {
    const nextPartial =
      typeof partial === "function" ? (partial as (state: T) => Partial<T>)(state as T) : partial;
    const nextState = { ...(state as T), ...nextPartial };
    if (state === nextState) return;
    const previous = state as T;
    state = nextState;
    listeners.forEach((listener) => listener(state as T, previous));
  };

  const getState: StoreApi<T>["getState"] = () => state as T;

  const subscribe: StoreApi<T>["subscribe"] = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  state = initializer(setState, getState);

  function useStore(): T;
  function useStore<U>(selector: Selector<T, U>, equalityFn?: EqualityChecker<U>): U;
  function useStore<U>(selector?: Selector<T, U>, equalityFn: EqualityChecker<U> = defaultEquality): U | T {
    const sel = selector ?? ((s: T) => s as unknown as U);
    const latestSelector = useRef(sel);
    const latestEquality = useRef(equalityFn);
    const previousStateRef = useRef(state as T);

    latestSelector.current = sel;
    latestEquality.current = equalityFn;

    const subscribeWithSelector = useCallback(
      (onChange: () => void) =>
        subscribe((nextState) => {
          const prevSelected = latestSelector.current(previousStateRef.current);
          const nextSelected = latestSelector.current(nextState);
          previousStateRef.current = nextState;
          if (!latestEquality.current(prevSelected, nextSelected)) {
            onChange();
          }
        }),
      [],
    );

    const getSnapshot = useCallback(() => latestSelector.current(getState()), []);

    return useSyncExternalStore(subscribeWithSelector, getSnapshot, getSnapshot);
  }

  useStore.setState = setState;
  useStore.getState = getState;
  useStore.subscribe = subscribe;

  return useStore as StoreHook<T>;
}

export type { StoreApi, StateCreator };
