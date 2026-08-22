"use client";

import { useEffect, useMemo } from "react";
import {
  APIProvider,
  Map,
  Marker,
  Polyline,
  useMap,
} from "@vis.gl/react-google-maps";

/** A single map coordinate. Mirrors `LatLng` from `@/lib/geo`, duplicated here
 * so this client component never imports the server-only geo module. */
type LatLng = {
  lat: number;
  lng: number;
};

/**
 * One entry of a Google Maps styled-map array. Mirrors `google.maps.MapTypeStyle`,
 * duplicated here because the `google` namespace is not reachable from project
 * source at all: `@types/google.maps` is only a transitive dependency of
 * `@vis.gl/react-google-maps`, and this project's `tsconfig.json` pins
 * `compilerOptions.types` to `["node"]`, so the global namespace those typings
 * declare is never loaded into our compilation. Same reflex as the duplicated
 * `LatLng` above — describe the shape locally rather than reach for a module
 * that isn't ours to import.
 *
 * `stylers` is deliberately loose (the real type is `object[]`) because each
 * styler is a one-key record whose key depends on what it adjusts — `color`,
 * `saturation`, `lightness`, `weight`, `visibility`.
 */
type MapTypeStyleEntry = {
  featureType?: string;
  elementType?: string;
  stylers: Record<string, string | number>[];
};

type RoutePreviewMapProps = {
  pickup: LatLng | null;
  /** The pickup address text, shown in the summary and on the marker tooltip. */
  pickupLabel: string;
  dropoff: LatLng | null;
  /** The dropoff address text, shown in the summary and on the marker tooltip. */
  dropoffLabel: string;
  /** Null until a live price estimate has resolved a distance. */
  distanceKm: number | null;
  /** Null until a vehicle type is selected. */
  vehicleLabel: string | null;
};

/** Fallback centre when nothing is geocoded yet — central Tbilisi (Georgia-only app). */
const DEFAULT_CENTER: LatLng = { lat: 41.7151, lng: 44.8271 };
/** City-wide zoom used with `DEFAULT_CENTER`. */
const DEFAULT_ZOOM = 12;
/** Street-level zoom used when a single marker makes `fitBounds` degenerate. */
const SINGLE_POINT_ZOOM = 15;
/** Padding kept around fitted markers so they never sit on the map edge. */
const FIT_BOUNDS_PADDING_PX = 64;

/**
 * Assumed average door-to-door speed, in km/h, used only to show the customer a
 * rough travel time next to the distance.
 *
 * This intentionally mirrors `AVERAGE_SPEED_KMH` in `src/lib/pricing.ts`, which
 * derives the time component of the real fare server-side from the same flat
 * assumption (the app has no traffic data). It is duplicated rather than
 * imported because that module is server-only — it reads env vars and pulls in
 * Prisma and the geocoding module — exactly the reasoning
 * `order-tracking-map.tsx` and `address-autocomplete.tsx` already give for
 * duplicating their types instead of importing from the server.
 *
 * Keep the two in step: if the pricing assumption is retuned, the preview here
 * should follow, or the quoted time will drift from the billed one.
 */
const ESTIMATED_TRAVEL_SPEED_KMH = 30;

const MINUTES_PER_HOUR = 60;

/**
 * Every route this app books is exactly one pickup plus one dropoff — there is
 * no multi-stop flow — so the stop count is a constant, not a derived figure.
 */
const ROUTE_STOP_COUNT = 2;

/** Placeholder for a summary figure that isn't known yet. */
const EMPTY_VALUE = "—";

/** The route line's colour — this project's brand orange (`--landing-accent`). */
const ROUTE_STROKE_COLOR = "#ff5a1f";
const ROUTE_STROKE_WEIGHT = 4;
const ROUTE_STROKE_OPACITY = 0.9;

/**
 * A cool green/teal restyle of the base map.
 *
 * The point is contrast: landcover, parks and water carry the whole surface in
 * low-saturation mint and teal, roads and labels are pushed back, and points of
 * interest are hidden entirely. That leaves the orange route line and its two
 * markers as the only saturated things on the canvas, which is the one job this
 * map has.
 */
const MAP_STYLES: MapTypeStyleEntry[] = [
  // Landcover reads as a pale mint wash rather than Google's default beige.
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#e6f2ee" }],
  },
  // Green space sits a shade deeper so it stays legible against that wash.
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#c7e3d6" }],
  },
  // Every other POI is flattened into the landcover and loses its label: this
  // is a route preview, not a map to explore.
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#dcebe5" }],
  },
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  // Water carries the teal end of the palette.
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#a5d2cc" }],
  },
  // Roads stay visible for orientation, but desaturated and pale.
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }, { saturation: -70 }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#f1f6f4" }],
  },
  {
    featureType: "road",
    elementType: "labels",
    stylers: [{ saturation: -60 }, { lightness: 20 }],
  },
  // Transit lines would read as competing routes next to the polyline.
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#b6cec7" }],
  },
  // Remaining labels: muted slate-green text on a soft halo, so they read over
  // both the mint landcover and the teal water.
  { elementType: "labels.text.fill", stylers: [{ color: "#5b6f69" }] },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#f3f8f6" }, { weight: 2 }],
  },
];

/** `${distanceKm} km`, or a placeholder while no estimate has resolved. */
function formatDistance(distanceKm: number | null): string {
  // Guards the non-finite case too: a malformed estimate should show the same
  // placeholder as no estimate, never "NaN km".
  if (distanceKm === null || !Number.isFinite(distanceKm)) {
    return EMPTY_VALUE;
  }

  return `${distanceKm.toFixed(1)} km`;
}

/** Rough travel time implied by the distance at `ESTIMATED_TRAVEL_SPEED_KMH`. */
function formatTravelTime(distanceKm: number | null): string {
  if (distanceKm === null || !Number.isFinite(distanceKm)) {
    return EMPTY_VALUE;
  }

  const minutes = Math.round(
    (distanceKm / ESTIMATED_TRAVEL_SPEED_KMH) * MINUTES_PER_HOUR,
  );

  // Tilde throughout: this is an assumption, not a routed ETA.
  return `~${minutes} min`;
}

/**
 * Keeps the camera framing both endpoints.
 *
 * Renders nothing — it only drives the imperative `google.maps.Map` handle from
 * `useMap()`, which is why it must live inside `<Map>`.
 *
 * Unlike the tracking map's controller, this one refits on every change to
 * `points` rather than only when their *count* changes. That guard exists there
 * to stop five-second driver polls from yanking the camera; here nothing polls,
 * so the only way `points` changes is the user picking a different address —
 * precisely when the camera should follow. `points` is memoised by the caller on
 * the raw coordinates, so a re-render that doesn't move either endpoint doesn't
 * refit either.
 */
function RouteCameraController({ points }: { points: LatLng[] }) {
  const map = useMap();

  useEffect(() => {
    const first = points[0];
    if (!map || !first) {
      return;
    }

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

/** One endpoint row in the summary header. */
function RouteEndpoint({
  badge,
  label,
  placeholder,
}: {
  badge: string;
  label: string;
  placeholder: string;
}) {
  const text = label.trim();

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[0.625rem] font-semibold text-accent">
        {badge}
      </span>
      <span
        className={`truncate text-[0.8125rem] leading-snug ${
          text ? "text-paper" : "text-muted"
        }`}
      >
        {text || placeholder}
      </span>
    </div>
  );
}

/**
 * The map and its summary, split out from `RoutePreviewMap` so the
 * missing-API-key fallback can return early without conditionally calling hooks.
 */
function RoutePreview({
  apiKey,
  pickup,
  pickupLabel,
  dropoff,
  dropoffLabel,
  distanceKm,
  vehicleLabel,
}: RoutePreviewMapProps & { apiKey: string }) {
  // Depend on the raw coordinates rather than the `pickup`/`dropoff` objects so
  // a parent re-render that rebuilds those literals — without actually moving an
  // endpoint — doesn't produce a new array identity and refit the camera.
  const pickupLat = pickup?.lat ?? null;
  const pickupLng = pickup?.lng ?? null;
  const dropoffLat = dropoff?.lat ?? null;
  const dropoffLng = dropoff?.lng ?? null;

  const pickupPoint = useMemo<LatLng | null>(
    () =>
      pickupLat !== null && pickupLng !== null
        ? { lat: pickupLat, lng: pickupLng }
        : null,
    [pickupLat, pickupLng],
  );

  const dropoffPoint = useMemo<LatLng | null>(
    () =>
      dropoffLat !== null && dropoffLng !== null
        ? { lat: dropoffLat, lng: dropoffLng }
        : null,
    [dropoffLat, dropoffLng],
  );

  const points = useMemo(() => {
    const list: LatLng[] = [];
    if (pickupPoint) {
      list.push(pickupPoint);
    }
    if (dropoffPoint) {
      list.push(dropoffPoint);
    }
    return list;
  }, [pickupPoint, dropoffPoint]);

  // Only drawn once both ends exist. Memoised so the polyline isn't handed a
  // fresh array — and torn down and rebuilt — on every render.
  const routePath = useMemo<LatLng[] | null>(
    () => (pickupPoint && dropoffPoint ? [pickupPoint, dropoffPoint] : null),
    [pickupPoint, dropoffPoint],
  );

  /**
   * The summary figures, driven by data rather than four hand-written blocks so
   * the label, value and typography of each stay in one place. `numeric` picks
   * the tabular price font used for figures elsewhere on the landing page; the
   * vehicle name is prose and reads better in the body face.
   */
  const summaryItems: { label: string; value: string; numeric: boolean }[] = [
    { label: "Stops", value: String(ROUTE_STOP_COUNT), numeric: true },
    { label: "Distance", value: formatDistance(distanceKm), numeric: true },
    {
      label: "Est. travel time",
      value: formatTravelTime(distanceKm),
      numeric: true,
    },
    { label: "Vehicle", value: vehicleLabel ?? EMPTY_VALUE, numeric: false },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="h-80 w-full">
        <APIProvider apiKey={apiKey}>
          <Map
            // `default*` props leave the camera uncontrolled, so the user can
            // pan and zoom freely; `RouteCameraController` only nudges it when
            // an endpoint actually moves.
            defaultCenter={points[0] ?? DEFAULT_CENTER}
            defaultZoom={points.length > 0 ? SINGLE_POINT_ZOOM : DEFAULT_ZOOM}
            styles={MAP_STYLES}
            gestureHandling="cooperative"
            disableDefaultUI
            zoomControl
            style={{ width: "100%", height: "100%" }}
          >
            {pickupPoint ? (
              <Marker
                position={pickupPoint}
                title={
                  pickupLabel.trim() ? `Pickup — ${pickupLabel}` : "Pickup"
                }
                label="P"
              />
            ) : null}
            {dropoffPoint ? (
              <Marker
                position={dropoffPoint}
                title={
                  dropoffLabel.trim() ? `Dropoff — ${dropoffLabel}` : "Dropoff"
                }
                label="D"
              />
            ) : null}
            {routePath ? (
              <Polyline
                path={routePath}
                strokeColor={ROUTE_STROKE_COLOR}
                strokeWeight={ROUTE_STROKE_WEIGHT}
                strokeOpacity={ROUTE_STROKE_OPACITY}
              />
            ) : null}
            <RouteCameraController points={points} />
          </Map>
        </APIProvider>
      </div>

      <section className="border-t border-line bg-surface px-4 py-3.5">
        <h3 className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted uppercase">
          Route summary
        </h3>

        <div className="mt-2.5 flex flex-col gap-1.5">
          <RouteEndpoint
            badge="P"
            label={pickupLabel}
            placeholder="Pickup address not set"
          />
          <RouteEndpoint
            badge="D"
            label={dropoffLabel}
            placeholder="Dropoff address not set"
          />
        </div>

        <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3.5 sm:grid-cols-4">
          {summaryItems.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted uppercase">
                {item.label}
              </dt>
              <dd
                className={`mt-1 truncate text-[0.8125rem] font-medium text-paper ${
                  item.numeric ? "font-price" : ""
                }`}
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

/**
 * Presentational preview of the route being booked: a restyled map with pickup
 * and dropoff markers joined by the brand-orange route line, above a compact
 * summary of stops, distance, estimated travel time and vehicle.
 *
 * Purely presentational and self-contained — it owns no layout beyond its own
 * card, and derives nothing it isn't handed. `pickup`/`dropoff` are nullable
 * because geocoding returns null on failure (see `@/lib/geo`) and because
 * neither address is resolved when the form first mounts; whichever coordinates
 * exist are rendered and the rest are skipped. `distanceKm` and `vehicleLabel`
 * are nullable for the same reason — they fill in as the user completes the
 * form. Uses the legacy `Marker` rather than `AdvancedMarker` so the map needs
 * only an API key, not a Google Cloud Map ID.
 */
export function RoutePreviewMap({
  pickup,
  pickupLabel,
  dropoff,
  dropoffLabel,
  distanceKm,
  vehicleLabel,
}: RoutePreviewMapProps): React.ReactElement {
  // Inlined at build time by Next because of the NEXT_PUBLIC_ prefix; must be
  // referenced as a full literal expression for that substitution to happen.
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Rendering `APIProvider` without a key just yields a broken grey canvas and
  // console errors, so state the reason instead. The summary panel goes with it:
  // a route summary floating above nothing would only invite the reader to
  // wonder where the map went.
  if (!apiKey) {
    return (
      <p className="rounded-xl border border-line p-4 text-sm text-muted">
        Map unavailable — missing Google Maps API key.
      </p>
    );
  }

  return (
    <RoutePreview
      apiKey={apiKey}
      pickup={pickup}
      pickupLabel={pickupLabel}
      dropoff={dropoff}
      dropoffLabel={dropoffLabel}
      distanceKm={distanceKm}
      vehicleLabel={vehicleLabel}
    />
  );
}
