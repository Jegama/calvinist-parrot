"use client";

import { useEffect, useMemo, useRef } from "react";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Marker, Popup, TileLayer } from "react-leaflet";

import { cn } from "@/lib/utils";
import type { ChurchListItem } from "@/types/church";

import styles from "./church-map.module.css";
import { SafeMapContainer } from "./safe-map-container";

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795]; // Center of the contiguous US
const DEFAULT_ZOOM = 5;

const iconRetinaUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
const iconUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
const shadowUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

type ChurchMapInnerProps = {
  churches: ChurchListItem[];
  onSelect: (church: ChurchListItem) => void;
  height?: number | null;
};

export function ChurchMapInner({ churches, onSelect, height }: ChurchMapInnerProps) {
  const mapRef = useRef<L.Map | null>(null);

  const markers = churches.filter(
    (church) => typeof church.latitude === "number" && typeof church.longitude === "number"
  );

  const center = useMemo(() => {
    if (!markers.length) return DEFAULT_CENTER;
    const avgLat = markers.reduce((sum, item) => sum + (item.latitude ?? 0), 0) / markers.length;
    const avgLng = markers.reduce((sum, item) => sum + (item.longitude ?? 0), 0) / markers.length;
    return [avgLat, avgLng] as [number, number];
  }, [markers]);

  const resolvedHeight = height && height > 0 ? Math.max(height, 420) : 420;

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    if (markers.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    if (markers.length === 1) {
      const onlyMarker = markers[0];
      map.setView([onlyMarker.latitude as number, onlyMarker.longitude as number], 11);
      return;
    }

    const bounds = L.latLngBounds(markers.map((church) => [church.latitude as number, church.longitude as number]));

    map.fitBounds(bounds.pad(0.2), { maxZoom: 11 });
  }, [markers]);

  useEffect(() => {
    mapRef.current?.invalidateSize();
  }, [resolvedHeight]);

  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-border bg-card/80", styles.mapShell)}
      style={{ height: resolvedHeight }}
    >
      {markers.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No map data available for this set of churches.
        </div>
      ) : (
        <SafeMapContainer
          ref={mapRef}
          center={center}
          zoom={DEFAULT_ZOOM}
          className="h-full w-full"
          style={{ height: resolvedHeight }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {markers.map((church) => (
            <Marker key={church.id} position={[church.latitude as number, church.longitude as number]}>
              <Popup className="text-foreground">
                <div className="space-y-0.1 text-sm">
                  <div>
                    <p className="font-semibold leading-tight text-foreground">{church.name}</p>
                    <p className="text-[0.8rem] text-muted-foreground">
                      {church.city && church.state
                        ? `${church.city}, ${church.state}`
                        : church.city ?? church.state ?? "Location unknown"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md bg-primary px-2.5 py-1 text-[0.9rem] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    onClick={() => onSelect(church)}
                  >
                    View details
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </SafeMapContainer>
      )}
    </div>
  );
}
