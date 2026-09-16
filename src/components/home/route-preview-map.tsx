"use client";

import { useEffect, useMemo } from "react";
import {
  APIProvider,
  Map,
  Marker,
  Polyline,
  useMap,
} from "@vis.gl/react-google-maps";

import { useTheme } from "@/hooks/use-theme";
import {
  MAP_STYLES_DARK,
  ROUTE_PREVIEW_MAP_STYLES_LIGHT,
} from "@/lib/map-styles";

/** A single map coordinate. Mirrors `LatLng` from `@/lib/geo`, duplicated here
 * so this client component never imports the server-only geo module. */
type LatLng = {
  lat: number;
  lng: number;
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
  /**
   * The road geometry of the quoted route, drawn in place of a straight line
   * between the markers. Null until a live price estimate resolves one — and
   * also when that estimate priced on straight-line distance because the server
   * could not route (see `getRoute` in `@/lib/geo`), in which case the straight
   * line is the honest thing to draw anyway.
   */
  routePath: LatLng[] | null;
  /** The quoted route's driving time. Null until a live price estimate resolves
   *  one, whereupon it replaces this component's own speed-based guess. */
  durationMinutes: number | null;
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
 * Assumed average door-to-door speed, in km/h, used to show the customer a rough
 * travel time next to the distance — but only as a fallback.
 *
 * A resolved estimate normally carries a real driving time from the server's
 * routing call, and `durationMinutes` takes precedence over this whenever it
 * does. This covers the two cases where no such figure exists: before any
 * estimate has resolved, and when the server itself could not route and priced
 * on straight-line distance (see `estimateDelivery` in `src/lib/pricing.ts`).
 *
 * It intentionally mirrors `AVERAGE_SPEED_KMH` in `src/lib/pricing.ts`, which is
 * the same flat assumption that file falls back to for the time component of the
 * fare. It is duplicated rather than imported because that module is
 * server-only — it reads env vars and pulls in Prisma and the geocoding module —
 * exactly the reasoning `order-tracking-map.tsx` and `address-autocomplete.tsx`
 * already give for duplicating their types instead of importing from the server.
 *
 * Keep the two in step: if the pricing fallback is retuned, the preview's
 * fallback here should follow, or on the routing-unavailable path the shown time
 * will drift from the billed one.
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

/**
 * The route line's colour, per theme — this project's brand orange, matching
 * `--landing-accent` in each half of the token set (`#ff5a1f` light,
 * `#f58220` dark).
 *
 * Spelled as literals rather than read from the CSS variable because the
 * polyline is drawn by the Maps SDK into its own canvas, where a `var()` never
 * resolves; `getComputedStyle` could fetch it, but that trades a one-line
 * constant for a layout read on every theme change. Keep these two in step with
 * `--landing-accent` in `src/app/globals.css` — the dark value is lighter for
 * the same reason the token is: the light orange goes muddy against a near-black
 * basemap.
 */
const ROUTE_STROKE_COLOR_LIGHT = "#ff5a1f";
const ROUTE_STROKE_COLOR_DARK = "#f58220";
const ROUTE_STROKE_WEIGHT = 4;
const ROUTE_STROKE_OPACITY = 0.9;

/** `${distanceKm} km`, or a placeholder while no estimate has resolved. */
function formatDistance(distanceKm: number | null): string {
  // Guards the non-finite case too: a malformed estimate should show the same
  // placeholder as no estimate, never "NaN km".
  if (distanceKm === null || !Number.isFinite(distanceKm)) {
    return EMPTY_VALUE;
  }

  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Travel time for the route: the server's real routed duration when there is
 * one, otherwise the time the distance implies at `ESTIMATED_TRAVEL_SPEED_KMH`.
 *
 * Both bases are formatted here rather than at the call site so the two can
 * never drift apart in wording or rounding — the reader is not told which one
 * they are looking at, so the two had better look alike.
 */
function formatTravelTime(
  distanceKm: number | null,
  durationMinutes: number | null,
): string {
  // Non-finite is filtered alongside null in both cases: a malformed estimate
  // should fall through to the placeholder, never render "NaN min".
  const minutes =
    durationMinutes !== null && Number.isFinite(durationMinutes)
      ? durationMinutes
      : distanceKm !== null && Number.isFinite(distanceKm)
        ? (distanceKm / ESTIMATED_TRAVEL_SPEED_KMH) * MINUTES_PER_HOUR
        : null;

  if (minutes === null) {
    return EMPTY_VALUE;
  }

  // Tilde throughout: even the routed figure is a free-flow estimate, not a
  // traffic-aware ETA.
  return `~${Math.round(minutes)} min`;
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
  routePath,
  durationMinutes,
  vehicleLabel,
}: RoutePreviewMapProps & { apiKey: string }) {
  // The one thing on this card that cannot be a `dark:` class. The basemap is
  // painted by the Maps SDK into its own canvas from a style array handed over
  // in JS, and the route polyline is drawn the same way, so both have to be
  // chosen here. `useTheme` tracks the `dark` class on `<html>` — the same
  // source of truth the `dark:` variant keys off — so the map re-styles the
  // instant the header's toggle is clicked, not on the next reload.
  //
  // `styles` is a live map option: `@vis.gl/react-google-maps` deep-compares it
  // and calls `map.setOptions()` when it changes, so swapping arrays restyles
  // the existing map rather than remounting it. The camera, the markers and any
  // pan or zoom the user has made are all preserved across the switch.
  const theme = useTheme();
  const isDark = theme === "dark";
  const mapStyles = isDark ? MAP_STYLES_DARK : ROUTE_PREVIEW_MAP_STYLES_LIGHT;
  const routeStrokeColor = isDark
    ? ROUTE_STROKE_COLOR_DARK
    : ROUTE_STROKE_COLOR_LIGHT;

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

  // The line actually drawn: the server's road geometry when a quote has
  // produced one, and a direct pickup-to-dropoff segment otherwise — before the
  // first estimate resolves, and whenever the server could not route and priced
  // on straight-line distance, which is exactly what the straight line depicts.
  //
  // Only drawn once both ends exist (a route the user has half-entered is not a
  // route). Memoised so the polyline isn't handed a fresh array — and torn down
  // and rebuilt — on every render.
  const polylinePath = useMemo<LatLng[] | null>(() => {
    if (routePath && routePath.length > 0) {
      return routePath;
    }

    return pickupPoint && dropoffPoint ? [pickupPoint, dropoffPoint] : null;
  }, [routePath, pickupPoint, dropoffPoint]);

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
      value: formatTravelTime(distanceKm, durationMinutes),
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
            styles={mapStyles}
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
            {polylinePath ? (
              <Polyline
                path={polylinePath}
                strokeColor={routeStrokeColor}
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
 * and dropoff markers joined by the brand-orange route line — following the real
 * roads once a quote has resolved them — above a compact summary of stops,
 * distance, estimated travel time and vehicle.
 *
 * Purely presentational and self-contained — it owns no layout beyond its own
 * card, and derives nothing it isn't handed. `pickup`/`dropoff` are nullable
 * because geocoding returns null on failure (see `@/lib/geo`) and because
 * neither address is resolved when the form first mounts; whichever coordinates
 * exist are rendered and the rest are skipped. `distanceKm`, `routePath`,
 * `durationMinutes` and `vehicleLabel` are nullable for the same reason — they
 * fill in as the user completes the form. Uses the legacy `Marker` rather than
 * `AdvancedMarker` so the map needs only an API key, not a Google Cloud Map ID.
 */
export function RoutePreviewMap({
  pickup,
  pickupLabel,
  dropoff,
  dropoffLabel,
  distanceKm,
  routePath,
  durationMinutes,
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
      routePath={routePath}
      durationMinutes={durationMinutes}
      vehicleLabel={vehicleLabel}
    />
  );
}
