"use client";

import { useMemo } from "react";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

import type { ChurchListItem } from "@/types/church";

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795]; // Center of the contiguous US

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

// @ts-ignore - Leaflet marker icon setup
L.Marker.prototype.options.icon = DefaultIcon;

type ChurchMapInnerProps = {
  churches: ChurchListItem[];
  onSelect: (church: ChurchListItem) => void;
};

export function ChurchMapInner({ churches, onSelect }: ChurchMapInnerProps) {
  const markers = churches.filter((church) =>
    typeof church.latitude === "number" && typeof church.longitude === "number"
  );

  const center = useMemo(() => {
    if (!markers.length) return DEFAULT_CENTER;
    const avgLat = markers.reduce((sum, item) => sum + (item.latitude ?? 0), 0) / markers.length;
    const avgLng = markers.reduce((sum, item) => sum + (item.longitude ?? 0), 0) / markers.length;
    return [avgLat, avgLng] as [number, number];
  }, [markers]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card/80">
      {markers.length === 0 ? (
        <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
          No map data available for this set of churches.
        </div>
      ) : (
        <MapContainer center={center} zoom={5} className="h-[420px] w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {markers.map((church) => (
            <Marker key={church.id} position={[church.latitude as number, church.longitude as number]}>
              <Popup>
                <div className="space-y-2">
                  <div>
                    <p className="font-semibold text-foreground">{church.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {church.city && church.state
                        ? `${church.city}, ${church.state}`
                        : church.city ?? church.state ?? "Location unknown"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    onClick={() => onSelect(church)}
                  >
                    View details
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      )}
    </div>
  );
}
