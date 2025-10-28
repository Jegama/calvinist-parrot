"use client";

import { LeafletProvider, createLeafletContext } from "@react-leaflet/core";
import { Map as LeafletMap } from "leaflet";
import type { MapContainerProps } from "react-leaflet";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import type { ForwardedRef } from "react";

type LeafletContainer = HTMLDivElement & {
  _leaflet_id?: number | undefined;
  __leaflet_map__?: LeafletMap;
};

function SafeMapContainerComponent(
  {
    bounds,
    boundsOptions,
    center,
    children,
    className,
    id,
    placeholder,
    style,
    whenReady,
    zoom,
    ...options
  }: MapContainerProps,
  forwardedRef: ForwardedRef<LeafletMap>
) {
  const containerProps = useMemo(() => ({ className, id, style }), [className, id, style]);
  const [mapOptions] = useState(() => options);
  const [context, setContext] = useState<ReturnType<typeof createLeafletContext> | null>(
    null
  );

  useImperativeHandle(forwardedRef, () => context?.map as LeafletMap, [context]);

  const mapRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node === null || context !== null) {
        return;
      }

      const container = node as LeafletContainer;

      if (container.__leaflet_map__) {
        // React Strict Mode can invoke the ref twice; reuse the existing map instance.
        setContext(createLeafletContext(container.__leaflet_map__));
        return;
      }

      const map = new LeafletMap(container, mapOptions);

      if (center != null && zoom != null) {
        map.setView(center, zoom);
      } else if (bounds != null) {
        map.fitBounds(bounds, boundsOptions);
      }

      if (whenReady != null) {
        map.whenReady(whenReady);
      }

      container.__leaflet_map__ = map;
      setContext(createLeafletContext(map));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [context, mapOptions]
  );

  useEffect(() => {
    return () => {
      if (!context?.map) {
        return;
      }

      const container = context.map.getContainer() as LeafletContainer | null;
      context.map.remove();

      if (container) {
        delete container._leaflet_id;
        delete container.__leaflet_map__;
      }
    };
  }, [context]);

  const contents = context ? (
    <LeafletProvider value={context}>{children}</LeafletProvider>
  ) : (
    placeholder ?? null
  );

  return (
    <div {...containerProps} ref={mapRef}>
      {contents}
    </div>
  );
}

export const SafeMapContainer = forwardRef<LeafletMap, MapContainerProps>(SafeMapContainerComponent);
