/**
 * Geocoding and distance/pricing helpers for the delivery domain.
 *
 * Geocoding uses LocationIQ's forward-geocoding endpoint. It is built on the
 * same OpenStreetMap data as Nominatim (and shares its query params), but its
 * free tier explicitly permits automated/cloud-hosted usage — usage is tied to
 * an API key rather than a `User-Agent` policy. The key is required config.
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
 * Read the required LocationIQ API key from the environment.
 *
 * The whole order-pricing flow depends on geocoding, so a missing key is a
 * configuration error, not a soft "not found" — throw loudly rather than
 * silently returning `null` and mispricing every order.
 */
function getApiKey(): string {
  const key = process.env.LOCATIONIQ_API_KEY;
  if (!key) {
    throw new Error(
      "LOCATIONIQ_API_KEY is not set. Add it to your environment — geocoding (and therefore order pricing) cannot run without it.",
    );
  }
  return key;
}

/**
 * Resolve a free-form address to coordinates via LocationIQ.
 *
 * Returns `null` for an empty/blank address, no match (empty result array or a
 * non-OK status such as 404), or any network/parse failure — callers can treat
 * `null` uniformly as "could not locate this address" without a try/catch.
 *
 * Throws only when the API key is missing, since that is a hard misconfiguration
 * rather than an unlocatable address.
 */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const query = address.trim();
  if (query.length === 0) {
    return null;
  }

  // Resolve the key first: a missing key must surface as a thrown config error,
  // not get swallowed by the catch below that maps failures to `null`.
  const key = getApiKey();

  const url =
    `${LOCATIONIQ_SEARCH_URL}?key=${encodeURIComponent(key)}` +
    `&format=json&limit=1&countrycodes=${GEOCODER_COUNTRY_CODE}` +
    `&viewbox=${GEOCODER_VIEWBOX}&bounded=1&q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": GEOCODER_USER_AGENT,
        Accept: "application/json",
      },
    });

    // A non-OK status (e.g. 404 "no results" depending on API version) is a
    // "not found", not an exception — return null per the function's contract.
    if (!response.ok) {
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
