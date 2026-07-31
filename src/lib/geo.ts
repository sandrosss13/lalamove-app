/**
 * Geocoding and distance/pricing helpers for the delivery domain.
 *
 * Geocoding uses LocationIQ's forward-geocoding endpoint. It is built on the
 * same OpenStreetMap data as Nominatim (and shares its query params), but its
 * free tier explicitly permits automated/cloud-hosted usage — usage is tied to
 * the `LOCATIONIQ_API_KEY` environment variable rather than a `User-Agent`
 * policy. That key is required config; without it, geocoding returns `null`.
 */

export type LatLng = {
  lat: number;
  lng: number;
};

/** LocationIQ forward-geocoding endpoint (`us1` is the standard default host). */
const LOCATIONIQ_SEARCH_URL = "https://us1.locationiq.com/v1/search";
/** Descriptive UA is optional for LocationIQ, but sent as good practice. */
const GEOCODER_USER_AGENT = "lalamove-clone-app (contact: dev@example.com)";
/** App operates only within Georgia; restrict results to avoid mismatches with international addresses that share a name. */
const GEOCODER_COUNTRY_CODE = "ge";
/** Bounding box roughly covering Georgia (`west,north,east,south`, Nominatim-compatible). */
const GEOCODER_VIEWBOX = "39.8,43.7,46.8,41.0";

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

/** Base fare applied on top of the distance-based charge, in the app currency. */
const BASE_FARE = 2.0;
/** Default per-kilometre rate when a caller does not supply one. */
const DEFAULT_PRICE_PER_KM = 1.0;

const EARTH_RADIUS_KM = 6371;

/** Shape of a single LocationIQ search result (only the fields we consume). */
type LocationIqResult = {
  lat: string;
  lon: string;
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
 * Fetch the LocationIQ search endpoint, retrying only on rate-limit (429) with
 * exponential backoff. Returns the OK response, or `null` for any terminal
 * non-OK status (e.g. 404 no match, 401 bad/missing key) or exhausted retries.
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

/**
 * Delivery price = flat base fare + distance × per-km rate, rounded to cents.
 * The base fare covers fixed pickup overhead so very short trips aren't free.
 */
export function calculatePrice(
  distanceKm: number,
  pricePerKm: number = DEFAULT_PRICE_PER_KM,
): number {
  const raw = BASE_FARE + distanceKm * pricePerKm;
  return Math.round(raw * 100) / 100;
}
