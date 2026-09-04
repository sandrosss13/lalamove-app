/**
 * Geocoding and distance helpers for the delivery domain. Pricing lives in
 * `src/lib/pricing.ts`, which builds on `geocodeAddress` and
 * `haversineDistanceKm` from here.
 *
 * Two geocoding providers are used, deliberately split by job:
 *
 * - **LocationIQ** (`geocodeAddress`) resolves a final, submitted address to
 *   coordinates for distance and pricing, and (`getRoute`) turns a resolved pair
 *   of coordinates into the actual driving route between them. It is built on
 *   the same OpenStreetMap data as Nominatim (and shares its query params), but
 *   its free tier explicitly permits automated/cloud-hosted usage — usage is
 *   tied to the `LOCATIONIQ_API_KEY` environment variable rather than a
 *   `User-Agent` policy. That key is required config; without it, geocoding and
 *   routing return `null`.
 * - **Google Places** (`suggestAddresses`, `getPlaceDetails`) backs the booking
 *   form's address field, via `GOOGLE_PLACES_API_KEY`: as-you-type suggestions
 *   first, then the structured breakdown (street/city/state/postcode/country
 *   plus coordinates for the map preview) of whichever one the user picks.
 *   LocationIQ's autocomplete returned poor matches for Georgian addresses, and
 *   that complaint was specific to the typing experience — so only the
 *   suggestions path moved to Google. Order-submission geocoding stays on
 *   LocationIQ.
 *
 * Both providers are scoped to Georgia via the same bounding box
 * (`GEORGIA_BOUNDS`), so their notion of "in range" stays consistent.
 *
 * Server-only: this module reads env vars, so it must never be pulled into a
 * client bundle.
 */

export type LatLng = {
  lat: number;
  lng: number;
};

/**
 * The driving route between two points: how far it actually is by road, how long
 * that is expected to take, and the line to draw for it.
 *
 * `path` is the full road geometry — every vertex the road bends through, not
 * just the two endpoints — so the map preview traces real streets instead of the
 * straight line `haversineDistanceKm` measures.
 */
export type Route = {
  distanceKm: number;
  durationMinutes: number;
  path: LatLng[];
};

/**
 * A single address suggestion returned by the autocomplete lookup. `placeId` is
 * Google's stable handle for the place, and is the only way to look the full
 * address breakdown up afterwards via `getPlaceDetails`.
 */
export type AddressSuggestion = {
  displayName: string;
  placeId: string;
};

/**
 * The structured breakdown of one place, as consumed by the booking form's
 * address fields. Every component is a plain string rather than
 * `string | undefined`: Google omits components it has no data for (rural
 * addresses routinely lack `postal_code`), and the form renders each one as an
 * editable input the user can fill in, so "" is the natural empty value.
 */
export type PlaceDetails = {
  location: LatLng;
  formattedAddress: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

/** LocationIQ forward-geocoding endpoint (`us1` is the standard default host). */
const LOCATIONIQ_SEARCH_URL = "https://us1.locationiq.com/v1/search";
/**
 * LocationIQ driving-directions endpoint (OSRM under the hood). Base only — the
 * two waypoints are appended as a path segment, `lon,lat;lon,lat`, before the
 * query string.
 */
const LOCATIONIQ_DIRECTIONS_URL =
  "https://us1.locationiq.com/v1/directions/driving";
/** Google Places Autocomplete (New) endpoint — as-you-type suggestions. */
const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";
/** Google Place Details (New) endpoint — one place, addressed by its place id. */
const GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";
/**
 * Field mask for Place Details. Required by the API (an unmasked request is
 * rejected), and narrowing it to exactly what `PlaceDetails` exposes keeps the
 * call in the cheapest billing SKU that still covers address components.
 */
const GOOGLE_PLACE_DETAILS_FIELD_MASK =
  "addressComponents,location,formattedAddress";
/** Minimum query length before a lookup is worthwhile (avoids noisy 1-2 char calls). */
const AUTOCOMPLETE_MIN_QUERY_LENGTH = 3;
/** Descriptive UA is optional for LocationIQ, but sent as good practice. */
const GEOCODER_USER_AGENT = "lalamove-clone-app (contact: dev@example.com)";
/** App operates only within Georgia; restrict results to avoid mismatches with international addresses that share a name. */
const GEOCODER_COUNTRY_CODE = "ge";
/** ISO 3166-1 alpha-2 form of the above, as Google's `includedRegionCodes` expects. */
const GEOCODER_REGION_CODE = "GE";

/**
 * Google `addressComponents` type tags, one per field of `PlaceDetails`. Named
 * here rather than inlined so the parsing below reads as a field mapping and a
 * typo surfaces in one place instead of silently yielding an empty string.
 */
const ADDRESS_COMPONENT_TYPES = {
  streetNumber: "street_number",
  route: "route",
  city: "locality",
  state: "administrative_area_level_1",
  postalCode: "postal_code",
  country: "country",
} as const;

/**
 * Components read from `shortText` instead of `longText`. Users write the
 * abbreviated form of a region on an address label ("Kvemo Kartli" is the long
 * name, but forms expect the short code), and postal codes have no long form at
 * all. Everything else — street, city, country — reads better spelled out.
 */
const SHORT_NAME_ADDRESS_COMPONENT_TYPES = new Set<string>([
  ADDRESS_COMPONENT_TYPES.state,
  ADDRESS_COMPONENT_TYPES.postalCode,
]);

/**
 * Bounding box roughly covering Georgia. Single source of truth for the
 * country scope, shared by both providers — LocationIQ takes it as a
 * comma-joined `viewbox` string, Google as a `locationBias` rectangle.
 */
const GEORGIA_BOUNDS = {
  west: 39.8,
  north: 43.7,
  east: 46.8,
  south: 41.0,
};

/** Georgia bounding box in LocationIQ/Nominatim `west,north,east,south` order. */
const GEOCODER_VIEWBOX =
  `${GEORGIA_BOUNDS.west},${GEORGIA_BOUNDS.north},` +
  `${GEORGIA_BOUNDS.east},${GEORGIA_BOUNDS.south}`;

/**
 * Minimum spacing between outbound LocationIQ requests. The free tier allows
 * 2 req/sec; ~550ms leaves headroom under that cap while staying responsive.
 */
const LOCATIONIQ_MIN_REQUEST_INTERVAL_MS = 550;
/** Max attempts (initial + retries) for a rate-limited request. */
const LOCATIONIQ_MAX_ATTEMPTS = 3;
/** Backoff before each retry, indexed by the just-completed attempt (1s, then 2s). */
const LOCATIONIQ_RETRY_BACKOFF_MS = [1000, 2000];
/** HTTP statuses worth retrying: LocationIQ returns 429 when rate-limited. */
const LOCATIONIQ_RETRYABLE_STATUSES = new Set([429]);

const EARTH_RADIUS_KM = 6371;

/** Directions reports distance in metres and duration in seconds; both are
 *  converted at the boundary so `Route` speaks the units the app quotes in. */
const METRES_PER_KM = 1000;
const SECONDS_PER_MINUTE = 60;

/** Shape of a single LocationIQ search result (only the fields we consume). */
type LocationIqResult = {
  lat: string;
  lon: string;
};

/**
 * Shape of the LocationIQ directions response (only the fields we consume). All
 * optional: a request that finds no route still answers 200, with a body that
 * simply carries no `routes` — so nothing here can be assumed present.
 *
 * `distance` is in metres and `duration` in seconds, both on the route itself
 * (they are also repeated per leg, but this app only ever asks for a single-leg,
 * two-waypoint route). `geometry.coordinates` is GeoJSON, so each pair is
 * `[lon, lat]` — the reverse of this module's `LatLng` field order.
 */
type LocationIqDirectionsResponse = {
  routes?: {
    distance?: number;
    duration?: number;
    geometry?: {
      coordinates?: [number, number][];
    };
  }[];
};

/**
 * Shape of the Google Places Autocomplete (New) response (only the fields we
 * consume). Every field is optional because entries may instead be a
 * `queryPrediction` (a free-text search suggestion with no associated place),
 * which carries no `placePrediction` and is skipped.
 */
type GooglePlacesAutocompleteResponse = {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: {
        text?: string;
      };
    };
  }[];
};

/**
 * One entry of Google's `addressComponents` array. Optional throughout: the
 * field mask guarantees the array is present but not that any given component
 * carries every property.
 */
type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

/**
 * Shape of the Google Place Details (New) response, limited to the fields
 * requested by `GOOGLE_PLACE_DETAILS_FIELD_MASK`. All optional — Google omits a
 * masked field entirely when it has no value for that place.
 */
type GooglePlaceDetailsResponse = {
  addressComponents?: GoogleAddressComponent[];
  location?: {
    latitude?: number;
    longitude?: number;
  };
  formattedAddress?: string;
};

/**
 * Process-wide serializing queue: every geocode call chains onto the previous
 * one so at most one request is in flight and consecutive calls are spaced by
 * `LOCATIONIQ_MIN_REQUEST_INTERVAL_MS`. Without this, concurrent pickup+dropoff
 * geocoding (the `Promise.all` in the orders route) could briefly exceed the
 * free tier's 2 req/sec cap.
 */
let requestQueue: Promise<unknown> = Promise.resolve();
let lastRequestTime = 0;

/** Resolve after `ms` milliseconds — used to space and back off requests. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rate-limited `fetch`: waits its turn in the serializing queue, then enforces
 * the minimum interval since the previous outbound request before firing.
 */
function throttledFetch(url: string, init: RequestInit): Promise<Response> {
  const run = async (): Promise<Response> => {
    const elapsed = Date.now() - lastRequestTime;
    const wait = LOCATIONIQ_MIN_REQUEST_INTERVAL_MS - elapsed;
    if (wait > 0) {
      await delay(wait);
    }
    lastRequestTime = Date.now();
    return fetch(url, init);
  };

  // Chain onto the queue (running whether the prior call resolved or rejected),
  // then reset the queue tail to a settled promise so one failure never poisons
  // subsequent callers.
  const result = requestQueue.then(run, run);
  requestQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Fetch a LocationIQ endpoint, retrying only on rate-limit (429) with
 * exponential backoff. Endpoint-agnostic — it just returns the OK `Response`
 * (callers parse the body), or `null` for any terminal non-OK status (e.g. 404
 * no match, 401 bad/missing key) or exhausted retries. Shared by every
 * LocationIQ caller so they all draw on the same rate-limit queue and budget.
 */
async function fetchGeocode(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < LOCATIONIQ_MAX_ATTEMPTS; attempt++) {
    const response = await throttledFetch(url, {
      headers: {
        "User-Agent": GEOCODER_USER_AGENT,
        Accept: "application/json",
      },
    });

    if (response.ok) {
      return response;
    }

    // Back off and retry while rate-limited and attempts remain; every other
    // non-OK status is terminal and maps to "not found".
    const canRetry =
      LOCATIONIQ_RETRYABLE_STATUSES.has(response.status) &&
      attempt < LOCATIONIQ_MAX_ATTEMPTS - 1;
    if (!canRetry) {
      return null;
    }

    // `canRetry` guarantees `attempt` indexes a defined backoff; the `?? 0`
    // only satisfies noUncheckedIndexedAccess and is never actually reached.
    await delay(LOCATIONIQ_RETRY_BACKOFF_MS[attempt] ?? 0);
  }

  return null;
}

/**
 * Resolve a free-form address to coordinates via LocationIQ.
 *
 * Returns `null` for an empty/blank address, a missing `LOCATIONIQ_API_KEY`, no
 * match (empty result array or a non-OK status such as 404), or any
 * network/parse failure — callers can treat `null` uniformly as "could not
 * locate this address" without a try/catch. This function never throws.
 */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const query = address.trim();
  if (query.length === 0) {
    return null;
  }

  // Without a key, every request would just 401; treat a missing/empty key as
  // "not found" (honouring the no-throw contract) rather than making the call.
  const key = process.env.LOCATIONIQ_API_KEY;
  if (!key) {
    return null;
  }

  const url =
    `${LOCATIONIQ_SEARCH_URL}?key=${encodeURIComponent(key)}` +
    `&format=json&limit=1&countrycodes=${GEOCODER_COUNTRY_CODE}` +
    `&viewbox=${GEOCODER_VIEWBOX}&bounded=1&q=${encodeURIComponent(query)}`;

  try {
    const response = await fetchGeocode(url);
    if (!response) {
      return null;
    }

    const results = (await response.json()) as unknown;
    if (!Array.isArray(results)) {
      return null;
    }

    const first = results[0] as LocationIqResult | undefined;
    if (!first) {
      return null;
    }

    const lat = Number.parseFloat(first.lat);
    const lng = Number.parseFloat(first.lon);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return null;
    }

    return { lat, lng };
  } catch {
    // Network error, aborted request, or malformed JSON — all "not found".
    return null;
  }
}

/**
 * Resolve the driving route between two coordinates via LocationIQ's directions
 * endpoint (OSRM), yielding road distance, expected driving time and the road
 * geometry to draw.
 *
 * This is what makes a quote reflect the drive rather than the crow's flight:
 * Tbilisi is split by the Mtkvari and its bridges, so straight-line distance
 * understates a real trip meaningfully. `haversineDistanceKm` remains as the
 * fallback for when this returns `null`.
 *
 * Returns `null` for a missing `LOCATIONIQ_API_KEY`, no route found (the
 * endpoint answers 200 with no `routes`), a non-OK status such as a rate limit
 * that outlived its retries, a response missing usable distance/duration/
 * geometry, or any network/parse failure — callers can treat `null` uniformly as
 * "no route available" and fall back to straight-line distance. This function
 * never throws.
 *
 * Goes through `fetchGeocode`, and so through the same serialising queue as
 * `geocodeAddress`: it is the same LocationIQ account and the same 2 req/sec
 * free-tier budget, so routing calls must be spaced against geocode calls, not
 * just against each other.
 */
export async function getRoute(
  origin: LatLng,
  destination: LatLng,
): Promise<Route | null> {
  // Without a key, every request would just 401; treat a missing/empty key as
  // "no route" (honouring the no-throw contract) rather than making the call.
  const key = process.env.LOCATIONIQ_API_KEY;
  if (!key) {
    return null;
  }

  // Waypoints go in GeoJSON/OSRM order — longitude first — which is the reverse
  // of `LatLng`'s field order, hence spelling each component out here.
  const waypoints =
    `${origin.lng},${origin.lat};` + `${destination.lng},${destination.lat}`;
  const url =
    `${LOCATIONIQ_DIRECTIONS_URL}/${waypoints}` +
    `?key=${encodeURIComponent(key)}&overview=full&geometries=geojson`;

  try {
    const response = await fetchGeocode(url);
    if (!response) {
      return null;
    }

    const payload = (await response.json()) as LocationIqDirectionsResponse;

    // Only ever one route is requested, and only one leg within it: this app
    // books a single pickup-to-dropoff trip with no intermediate stops.
    const route = payload.routes?.[0];
    if (!route) {
      return null;
    }

    const { distance, duration } = route;
    if (typeof distance !== "number" || typeof duration !== "number") {
      return null;
    }

    // A route with no geometry could still price, but the caller asks for a
    // `Route` to draw as well as to charge for; a partial answer would silently
    // leave the map showing a stale line, so treat it as no route at all.
    const coordinates = route.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      return null;
    }

    return {
      distanceKm: distance / METRES_PER_KM,
      durationMinutes: duration / SECONDS_PER_MINUTE,
      path: coordinates.map(([lng, lat]) => ({ lat, lng })),
    };
  } catch {
    // Network error, aborted request, or malformed JSON — all "no route".
    return null;
  }
}

/**
 * Suggest Georgia addresses matching a partial, as-you-type query via Google's
 * Places Autocomplete (New) endpoint.
 *
 * Returns `[]` for a query shorter than three characters, a missing
 * `GOOGLE_PLACES_API_KEY`, no matches, or any network/parse failure — callers
 * can treat `[]` uniformly as "no suggestions". This function never throws.
 *
 * Deliberately bypasses `fetchGeocode`: that queue exists to ration LocationIQ's
 * 2 req/sec free tier and sends LocationIQ's headers. Google is a separate quota,
 * and funnelling keystroke lookups through a 550ms spacer would add exactly the
 * latency this dropdown needs to avoid.
 */
export async function suggestAddresses(
  query: string,
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < AUTOCOMPLETE_MIN_QUERY_LENGTH) {
    return [];
  }

  // Without a key, every request would just 403; treat a missing/empty key as
  // "no suggestions" (honouring the no-throw contract) rather than making the call.
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return [];
  }

  try {
    const response = await fetch(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
      },
      body: JSON.stringify({
        input: trimmed,
        // Hard country filter, mirroring LocationIQ's `countrycodes`.
        includedRegionCodes: [GEOCODER_REGION_CODE],
        // Soft relevance bias toward the same box LocationIQ is scoped to. A
        // rectangle rather than a circle: Google caps circle radius at 50km,
        // far too small to cover Georgia, while a viewport has no size limit.
        locationBias: {
          rectangle: {
            low: {
              latitude: GEORGIA_BOUNDS.south,
              longitude: GEORGIA_BOUNDS.west,
            },
            high: {
              latitude: GEORGIA_BOUNDS.north,
              longitude: GEORGIA_BOUNDS.east,
            },
          },
        },
      }),
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as GooglePlacesAutocompleteResponse;

    const suggestions: AddressSuggestion[] = [];
    for (const entry of payload.suggestions ?? []) {
      // Skip `queryPrediction` entries and anything missing a usable label.
      const displayName = entry.placePrediction?.text?.text;
      if (!displayName) {
        continue;
      }

      // A suggestion with no place id cannot be resolved to a structured
      // address later, so it is as unusable as one with no label.
      const placeId = entry.placePrediction?.placeId;
      if (!placeId) {
        continue;
      }

      suggestions.push({ displayName, placeId });
    }

    return suggestions;
  } catch {
    // Network error, aborted request, or malformed JSON — all "no suggestions".
    return [];
  }
}

/**
 * Pull one component out of Google's `addressComponents` array by type tag,
 * picking `shortText` or `longText` per `SHORT_NAME_ADDRESS_COMPONENT_TYPES`.
 * Returns "" when the place has no such component (or the chosen text is
 * absent), matching `PlaceDetails`' "empty string, never undefined" contract.
 */
function readAddressComponent(
  components: GoogleAddressComponent[],
  type: string,
): string {
  const match = components.find((component) => component.types?.includes(type));
  if (!match) {
    return "";
  }

  const text = SHORT_NAME_ADDRESS_COMPONENT_TYPES.has(type)
    ? match.shortText
    : match.longText;

  return text ?? "";
}

/**
 * Resolve one autocomplete suggestion (by its `placeId`) to coordinates plus a
 * structured address breakdown, via Google's Place Details (New) endpoint.
 *
 * Returns `null` for a blank `placeId`, a missing `GOOGLE_PLACES_API_KEY`, a
 * non-OK status (e.g. 404 for a stale/expired place id, 403 for a bad key), a
 * response carrying no usable coordinates, or any network/parse failure —
 * callers can treat `null` uniformly as "no details available" and fall back to
 * the free-text address the user already has. This function never throws.
 *
 * Like `suggestAddresses`, this deliberately bypasses `fetchGeocode`: that queue
 * rations LocationIQ's 2 req/sec free tier and sends LocationIQ's headers, while
 * this is a separate provider on a separate quota. It also fires interactively —
 * once per suggestion the user picks — so the queue's 550ms spacer would only
 * add latency between the click and the map preview appearing.
 */
export async function getPlaceDetails(
  placeId: string,
): Promise<PlaceDetails | null> {
  const trimmed = placeId.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Without a key, every request would just 403; treat a missing/empty key as
  // "no details" (honouring the no-throw contract) rather than making the call.
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return null;
  }

  try {
    const response = await fetch(
      `${GOOGLE_PLACE_DETAILS_URL}/${encodeURIComponent(trimmed)}`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": GOOGLE_PLACE_DETAILS_FIELD_MASK,
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as GooglePlaceDetailsResponse;

    // Coordinates are the one non-optional part of `PlaceDetails` (the map
    // preview and any downstream distance work need them), so a place without
    // them counts as no details at all rather than a half-filled result.
    const lat = payload.location?.latitude;
    const lng = payload.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return null;
    }

    const components = payload.addressComponents ?? [];

    // Google splits a street address across two components; the house number
    // comes first in every locale this app serves. `trim` covers the common
    // case of a route with no street number attached.
    const street = [
      readAddressComponent(components, ADDRESS_COMPONENT_TYPES.streetNumber),
      readAddressComponent(components, ADDRESS_COMPONENT_TYPES.route),
    ]
      .join(" ")
      .trim();

    return {
      location: { lat, lng },
      formattedAddress: payload.formattedAddress ?? "",
      street,
      city: readAddressComponent(components, ADDRESS_COMPONENT_TYPES.city),
      state: readAddressComponent(components, ADDRESS_COMPONENT_TYPES.state),
      postalCode: readAddressComponent(
        components,
        ADDRESS_COMPONENT_TYPES.postalCode,
      ),
      country: readAddressComponent(
        components,
        ADDRESS_COMPONENT_TYPES.country,
      ),
    };
  } catch {
    // Network error, aborted request, or malformed JSON — all "no details".
    return null;
  }
}

/** Convert degrees to radians. */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates in kilometres (haversine).
 * Pure function — safe to unit-test in isolation.
 */
export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const h =
    sinLat * sinLat +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * sinLng * sinLng;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_KM * c;
}
