"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, Map, Marker, useMap } from "@vis.gl/react-google-maps";

import { useTheme } from "@/hooks/use-theme";
import { DEFAULT_MAP_STYLES, MAP_STYLES_DARK } from "@/lib/map-styles";

/** A single map coordinate. Mirrors `LatLng` from `@/lib/geo`, duplicated here
 * so this client component never imports the server-only geo module. */
type LatLng = {
  lat: number;
  lng: number;
};

/**
 * Driver position as returned by `GET /api/orders/[id]/location`. Every field is
 * nullable because a driver can be assigned before ever pushing a location, and
 * `updatedAt` arrives as a JSON-serialised ISO string rather than a `Date`.
 */
type DriverLocation = {
  lat: number | null;
  lng: number | null;
  updatedAt: string | null;
  isOnline: boolean;
};

/** Response body of the tracking endpoint; `driver` is null until one is assigned. */
type LocationResponse = {
  driver: DriverLocation | null;
};

type OrderTrackingMapProps = {
  orderId: string;
  pickup: LatLng | null;
  dropoff: LatLng | null;
};

/** How often the driver's position is re-fetched, in milliseconds. */
const POLL_INTERVAL_MS = 5000;
/** Age past which a reported position is flagged as possibly out of date. */
const STALE_LOCATION_MS = 60_000;
/** Fallback centre when nothing is geocoded yet — central Tbilisi (Georgia-only app). */
const DEFAULT_CENTER: LatLng = { lat: 41.7151, lng: 44.8271 };
/** City-wide zoom used with `DEFAULT_CENTER`. */
const DEFAULT_ZOOM = 12;
/** Street-level zoom used when a single marker makes `fitBounds` degenerate. */
const SINGLE_POINT_ZOOM = 15;
/** Padding kept around fitted markers so they never sit on the map edge. */
const FIT_BOUNDS_PADDING_PX = 64;

/**
 * Keeps the camera framing every marker that exists.
 *
 * Renders nothing — it only drives the imperative `google.maps.Map` handle from
 * `useMap()`, which is why it must live inside `<Map>`. It refits only when the
 * *number* of markers changes (e.g. the driver's position arrives for the first
 * time); refitting on every polled coordinate would yank the camera back every
 * few seconds and fight the user panning or zooming.
 */
function MapCameraController({ points }: { points: LatLng[] }) {
  const map = useMap();
  const lastFittedCountRef = useRef<number | null>(null);

  useEffect(() => {
    const first = points[0];
    if (!map || !first) {
      return;
    }

    if (lastFittedCountRef.current === points.length) {
      return;
    }
    lastFittedCountRef.current = points.length;

    // A one-point bounding box has zero area, which `fitBounds` resolves to the
    // maximum zoom; centre on it explicitly instead.
    if (points.length === 1) {
      map.setCenter(first);
      map.setZoom(SINGLE_POINT_ZOOM);
      return;
    }

    const bounds = points.reduce(
      (acc, point) => ({
        north: Math.max(acc.north, point.lat),
        south: Math.min(acc.south, point.lat),
        east: Math.max(acc.east, point.lng),
        west: Math.min(acc.west, point.lng),
      }),
      { north: first.lat, south: first.lat, east: first.lng, west: first.lng },
    );

    map.fitBounds(bounds, FIT_BOUNDS_PADDING_PX);
  }, [map, points]);

  return null;
}

/**
 * The map itself, split out from `OrderTrackingMap` so the missing-API-key
 * fallback can return early without conditionally calling hooks.
 */
function TrackingMap({
  apiKey,
  orderId,
  pickup,
  dropoff,
}: OrderTrackingMapProps & { apiKey: string }) {
  // The basemap is painted by the Maps SDK into its own canvas, so no `dark:`
  // utility reaches it and the style array has to be picked here. `useTheme`
  // tracks the `dark` class on `<html>` — the same source of truth the `dark:`
  // variant keys off — so the map re-styles the instant the header's toggle is
  // clicked rather than on the next reload.
  //
  // Light mode keeps Google's stock basemap, which is what this screen has
  // always shown and what a customer watching a driver move expects; only dark
  // mode brings a hand-authored array, because Google has no default dark
  // basemap reachable without a Cloud-styled Map ID. `DEFAULT_MAP_STYLES` is an
  // empty array rather than `undefined` for a real reason — see its note in
  // `@/lib/map-styles`.
  //
  // `styles` is a live map option: `@vis.gl/react-google-maps` deep-compares it
  // and calls `map.setOptions()` when it changes, so the swap restyles the
  // existing map in place. The camera is untouched, which matters here more
  // than on the preview — `MapCameraController` deliberately refits only when
  // the *number* of markers changes, so a remount would be the one thing able
  // to yank a user's pan back mid-delivery.
  const mapStyles =
    useTheme() === "dark" ? MAP_STYLES_DARK : DEFAULT_MAP_STYLES;

  const [driver, setDriver] = useState<DriverLocation | null>(null);
  // Refreshed on every tick so the staleness check re-evaluates even when the
  // driver's reported position stops changing.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function fetchDriverLocation(): Promise<void> {
      try {
        const response = await fetch(`/api/orders/${orderId}/location`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as LocationResponse;
        if (cancelled) {
          return;
        }
        setDriver(payload.driver ?? null);
      } catch {
        // Network error, malformed JSON, or an abort on unmount — skip this
        // tick and keep the last known position rather than tearing down the map.
      }
    }

    void fetchDriverLocation();
    const timer = setInterval(() => {
      setNow(Date.now());
      void fetchDriverLocation();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [orderId]);

  const driverLat = driver?.lat ?? null;
  const driverLng = driver?.lng ?? null;
  const hasDriverPosition = driverLat !== null && driverLng !== null;

  // Depends on the raw coordinates rather than the driver object so a poll that
  // returns an unchanged position doesn't produce a new array identity.
  const points = useMemo(() => {
    const list: LatLng[] = [];
    if (pickup) {
      list.push(pickup);
    }
    if (dropoff) {
      list.push(dropoff);
    }
    if (driverLat !== null && driverLng !== null) {
      list.push({ lat: driverLat, lng: driverLng });
    }
    return list;
  }, [pickup, dropoff, driverLat, driverLng]);

  const updatedAtMs = driver?.updatedAt ? Date.parse(driver.updatedAt) : null;
  const isStale =
    hasDriverPosition &&
    updatedAtMs !== null &&
    !Number.isNaN(updatedAtMs) &&
    now - updatedAtMs > STALE_LOCATION_MS;

  return (
    <div className="flex flex-col gap-2">
      <div className="h-96 w-full overflow-hidden rounded border">
        <APIProvider apiKey={apiKey}>
          <Map
            // `default*` props leave the camera uncontrolled, so the user can
            // pan and zoom freely; `MapCameraController` only nudges it when the
            // set of markers changes.
            defaultCenter={points[0] ?? DEFAULT_CENTER}
            defaultZoom={points.length > 0 ? SINGLE_POINT_ZOOM : DEFAULT_ZOOM}
            styles={mapStyles}
            gestureHandling="cooperative"
            disableDefaultUI
            zoomControl
            style={{ width: "100%", height: "100%" }}
          >
            {pickup ? (
              <Marker position={pickup} title="Pickup" label="P" />
            ) : null}
            {dropoff ? (
              <Marker position={dropoff} title="Dropoff" label="D" />
            ) : null}
            {driverLat !== null && driverLng !== null ? (
              <Marker
                position={{ lat: driverLat, lng: driverLng }}
                title="Driver"
                label="🚚"
              />
            ) : null}
            <MapCameraController points={points} />
          </Map>
        </APIProvider>
      </div>

      {hasDriverPosition ? null : (
        <p className="text-sm opacity-70">
          Waiting for a driver to share their location…
        </p>
      )}

      {isStale ? (
        // A palette utility is a fixed hex and cannot follow the theme. In dark
        // mode the warning climbs the ramp rather than darkening: `yellow-700`
        // against a near-black page reads as dim brown text, losing the "this
        // figure may be wrong" signal that is the line's entire purpose.
        <p className="text-sm text-yellow-700 dark:text-yellow-400">
          Driver location may be stale.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Live tracking map for one order: static pickup/dropoff markers plus the
 * assigned driver's position, polled from `/api/orders/[id]/location`.
 *
 * `pickup`/`dropoff` are nullable because geocoding returns null on failure
 * (see `@/lib/geo`); whichever coordinates exist are rendered and the rest are
 * skipped. Uses the legacy `Marker` rather than `AdvancedMarker` so the map
 * needs only an API key, not a Google Cloud Map ID.
 */
export function OrderTrackingMap({
  orderId,
  pickup,
  dropoff,
}: OrderTrackingMapProps) {
  // Inlined at build time by Next because of the NEXT_PUBLIC_ prefix; must be
  // referenced as a full literal expression for that substitution to happen.
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Rendering `APIProvider` without a key just yields a broken grey canvas and
  // console errors, so state the reason instead.
  if (!apiKey) {
    return (
      <p className="rounded border p-4 text-sm opacity-70">
        Map unavailable — missing Google Maps API key.
      </p>
    );
  }

  return (
    <TrackingMap
      apiKey={apiKey}
      orderId={orderId}
      pickup={pickup}
      dropoff={dropoff}
    />
  );
}
