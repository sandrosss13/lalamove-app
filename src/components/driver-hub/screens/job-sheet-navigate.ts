/**
 * The "Navigate" control on the Job sheet screen (`/dashboard/jobs/[id]`):
 * everything needed to hand one stop — a pick-up or a drop-off — to whichever
 * map app the driver's device already has, and nothing else.
 *
 * ## Why a handoff and not a map
 *
 * This codebase already renders maps: `order-tracking-map.tsx`,
 * `route-preview-map.tsx` and `address-autocomplete.tsx` all mount
 * `@vis.gl/react-google-maps`. None of that belongs on this screen. A driver
 * tapping Navigate is about to start moving, and what they need is turn-by-turn
 * with voice guidance, live traffic, a lock-screen, CarPlay/Android Auto and
 * offline tiles — every one of which is owned by the native app and none of
 * which an embedded canvas can offer. An in-page map would also hold the
 * browser tab in the foreground for the length of a delivery, which is the one
 * thing a phone in a windscreen cradle must not do. So this module emits a URL
 * and the caller renders it as an `<a href>`.
 *
 * ## What this module deliberately does not do
 *
 * - **It does not geocode.** No API key, no network call, no new dependency.
 *   `Order.pickupAddress` is free text a client typed, frequently mixed
 *   Georgian and Latin script; the map app on the far side is the component in
 *   this stack that owns a geocoder *and* the local knowledge to resolve
 *   "ვაჟა-ფშაველას გამზირი 76" — so the raw string is handed over intact and
 *   the app resolves it.
 * - **It does not open anything.** No `window.open`, no `location.assign`. The
 *   caller renders an anchor, which keeps this file free of side effects,
 *   leaves the pop-up blocker out of it, and lets a driver long-press to copy
 *   or share the destination.
 * - **It does not feature-detect installed apps.** No such detection exists on
 *   either platform; see `googleMapsIosHref`, which is the whole reason the
 *   iOS default is Apple Maps.
 * - **It does not touch the DOM at import time.** `detectMapsPlatform` is the
 *   only function that reads `navigator`, and it degrades to `"web"` when
 *   there is none, so this module is safe to import from a component that
 *   server-renders.
 *
 * ## A coordinate-less stop is an ordinary case, not an edge case
 *
 * `Order.pickupLat` / `pickupLng` (and the drop-off pair) are nullable, and
 * plenty of orders carry no pair: `scripts/seed-driver-hub-personas.ts` sets
 * none of them, and nothing downstream of the booking form guarantees one
 * either. Both branches are therefore live, and the address path is built as a
 * first-class destination rather than as a fallback nobody exercises — it has
 * to route a driver as competently as the coordinate path does, and it is the
 * one that carries the city-disambiguation rule.
 */

/* -------------------------------------------------------------------------- */
/* Destinations                                                               */
/* -------------------------------------------------------------------------- */

/** Which app scheme the current device should be handed off to. */
export type MapsPlatform = "ios" | "android" | "web";

/**
 * Where the driver is being sent, once resolved from the order's columns.
 *
 * Three cases rather than a nullable string, because the *kind* of destination
 * changes what the UI may promise. Coordinates land the driver on the loading
 * bay; an address lands them on a map app's best guess at a street a client
 * typed; `"unavailable"` means the control must not render at all. Collapsing
 * the first two would let a caller print "Navigate to the exact location" over
 * a free-text guess.
 */
export type NavigationDestination =
  | { kind: "coords"; lat: number; lng: number; label: string }
  | { kind: "address"; query: string }
  | { kind: "unavailable" };

/** Latitude runs ±90°, longitude ±180°. Anything outside is not a place. */
const MAX_ABSOLUTE_LATITUDE = 90;
const MAX_ABSOLUTE_LONGITUDE = 180;

/** What separates a street from its city in a geocoder query string. */
const CITY_SEPARATOR = ", ";

/**
 * Both coordinates as real, in-range numbers, or `null` when the pair cannot be
 * trusted.
 *
 * Returns the pair rather than a boolean so the caller narrows without a cast
 * or a non-null assertion.
 *
 * `NaN` and `Infinity` are excluded first: both are `number` as far as the type
 * system is concerned, and a `NaN` that reaches a URL is handed to the map app
 * as the literal text "NaN", which it will cheerfully search for.
 *
 * The range check is the part that protects the driver. A value outside ±90 or
 * ±180 is not a place, and the usual way one appears is a transposed pair: any
 * longitude east of 90° — most of Asia — becomes an impossible latitude the
 * moment the two are swapped, and a `999` sentinel or a metre-based projection
 * leaking into the column fails the same test. Those fall through to the
 * address, because an address is a guess at the right street whereas a wrong
 * coordinate is a confident, silent instruction to drive to the wrong country.
 *
 * It is a floor rather than a proof, deliberately. Georgia sits at roughly
 * 41–43°N, 40–47°E, so *its* coordinates transposed — 44.8, 41.7, a field in
 * southern Russia — are two in-range numbers and survive this check. Catching
 * that needs a bounding box, and a bounding box is a claim about where this
 * platform operates: it belongs on the write path, beside the geocode that
 * produced the pair, not in a display helper that would then refuse to navigate
 * to a legitimate stop over the border.
 */
function toTrustedCoordinates(
  lat: number | null,
  lng: number | null,
): { lat: number; lng: number } | null {
  if (lat === null || lng === null) {
    return null;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (Math.abs(lat) > MAX_ABSOLUTE_LATITUDE) {
    return null;
  }

  if (Math.abs(lng) > MAX_ABSOLUTE_LONGITUDE) {
    return null;
  }

  return { lat, lng };
}

/**
 * `"ვაჟა-ფშაველას გამზირი 76"` + `"Tbilisi"` → `"ვაჟა-ფშაველას გამზირი 76,
 * Tbilisi"`; the same street with `"Tbilisi"` already in it comes back
 * unchanged.
 *
 * The city is what makes a free-text Georgian street searchable at all: 63
 * `GeorgianCity` values share street names — a "Rustaveli Avenue" exists in
 * Tbilisi, Batumi and Kutaisi alike — and a geocoder handed the street alone
 * picks one, usually the largest. The order already knows which, in
 * `Order.pickupCity`, so it is appended.
 *
 * The substring guard is case-insensitive because the two sides come from
 * different places and agree on nothing: `pickupAddress` is what a human typed
 * and `pickupCity` is a `GeorgianCity` enum value. A caller passing the
 * humanised label (`formatCity`, `src/lib/format-city.ts`) is what the UI
 * should do — it is the string that ends up in the URL — but a caller passing
 * the raw `"TBILISI"` still de-duplicates correctly against an address reading
 * "Tbilisi", which is the failure this guard exists for: "…76, Tbilisi,
 * Tbilisi" is a query a geocoder scores lower than the address on its own.
 */
function withCity(address: string, city: string | null): string {
  const trimmedCity = city === null ? "" : city.trim();

  if (trimmedCity.length === 0) {
    return address;
  }

  if (address.toLowerCase().includes(trimmedCity.toLowerCase())) {
    return address;
  }

  return `${address}${CITY_SEPARATOR}${trimmedCity}`;
}

/**
 * Resolve one stop's four columns into the best destination they support.
 *
 * Coordinates win when they are trustworthy, because they are the only input
 * that names a *point*: a warehouse whose gate is 200 m off the road it is
 * addressed on is routed correctly by a lat/lng and incorrectly by its address.
 * The trimmed address rides along as `label` so the map app has something to
 * name the pin — Apple Maps and Google Maps both show a bare coordinate as its
 * own digits otherwise, which tells a driver nothing about which of the day's
 * stops they are looking at.
 *
 * Everything below that degrades rather than failing: an untrustworthy pair
 * (see `toTrustedCoordinates`) is treated exactly like an absent one, and only
 * a stop with neither a point nor any address text at all is `"unavailable"`.
 * The address branch is not a rarely-taken safety net — a coordinate-less order
 * is ordinary, see the module comment — so it is held to the same standard as
 * the coordinate one.
 */
export function toNavigationDestination(
  lat: number | null,
  lng: number | null,
  address: string,
  city: string | null,
): NavigationDestination {
  const trimmedAddress = address.trim();
  const coordinates = toTrustedCoordinates(lat, lng);

  if (coordinates !== null) {
    return {
      kind: "coords",
      lat: coordinates.lat,
      lng: coordinates.lng,
      label: trimmedAddress,
    };
  }

  if (trimmedAddress.length === 0) {
    return { kind: "unavailable" };
  }

  return { kind: "address", query: withCity(trimmedAddress, city) };
}

/* -------------------------------------------------------------------------- */
/* Platform detection                                                         */
/* -------------------------------------------------------------------------- */

/** iOS gives itself away on the user agent — except on iPad; see below. */
const IOS_USER_AGENT_PATTERN = /iPad|iPhone|iPod/;

const ANDROID_USER_AGENT_PATTERN = /Android/;

/**
 * What an iPad running iPadOS 13+ in its default "desktop-class" mode reports
 * as `navigator.platform`: a lie, and the only one the platform tells about
 * itself consistently enough to test for.
 */
const IPADOS_REPORTED_PLATFORM = "MacIntel";

/**
 * A real Mac reports 0 touch points, or 1 where a touch bar or trackpad is
 * counted; an iPad reports 5. `> 1` is the boundary that separates them
 * without depending on either exact figure.
 */
const DESKTOP_MAX_TOUCH_POINTS = 1;

/**
 * Best-effort platform sniff, used only to choose between two URL forms that
 * both work.
 *
 * User-agent sniffing is normally the wrong tool, and it is the right one here
 * for a narrow reason: the question is not "what can this browser do" — which
 * is feature-detectable — but "which app store's URL scheme is installed on
 * this operating system", which is not exposed to a web page at all. Getting it
 * wrong is cheap in one direction (an iPhone misread as web opens Google Maps
 * in Safari, which then offers to open the app) and never fatal, because
 * `mapsHandoffHref`'s default targets are apps that ship with the OS.
 *
 * **Returns `"web"` when there is no `navigator`.** This module is imported by
 * a component that server-renders, so reading `navigator` unguarded would throw
 * during SSR rather than degrade.
 *
 * **Callers must resolve this in a `useEffect`, not during render.** The server
 * necessarily renders the `"web"` href, so a component that sniffed during its
 * first client render would emit a different href and hydrate with a mismatch.
 * Render the `"web"` form, then swap it once mounted.
 *
 * The iPadOS 13+ case is a second check rather than a wider regex: an iPad in
 * its default mode has *no* iPad marker anywhere in its user agent and presents
 * itself as a desktop Mac. Without this an iPad — the most likely tablet in a
 * cab — would be handed the web URL and lose its Apple Maps handoff.
 */
export function detectMapsPlatform(): MapsPlatform {
  if (typeof navigator === "undefined") {
    return "web";
  }

  if (IOS_USER_AGENT_PATTERN.test(navigator.userAgent)) {
    return "ios";
  }

  if (
    navigator.platform === IPADOS_REPORTED_PLATFORM &&
    navigator.maxTouchPoints > DESKTOP_MAX_TOUCH_POINTS
  ) {
    return "ios";
  }

  if (ANDROID_USER_AGENT_PATTERN.test(navigator.userAgent)) {
    return "android";
  }

  return "web";
}

/* -------------------------------------------------------------------------- */
/* Handoff URLs                                                               */
/* -------------------------------------------------------------------------- */

/** Apple Maps' directions scheme; present on every iPhone and iPad. */
const APPLE_MAPS_SCHEME = "maps://";

/** Apple's `dirflg` code for driving directions (`w` walks, `r` transits). */
const APPLE_MAPS_DRIVING_FLAG = "d";

/**
 * Google Maps' cross-platform URL. Android's intent filter claims this exact
 * host and path for the installed app, so one string serves both the phone and
 * the desktop tab.
 */
const GOOGLE_MAPS_DIRECTIONS_URL = "https://www.google.com/maps/dir/";

/** `api=1` opts into Google's stable, documented URL contract. */
const GOOGLE_MAPS_API_VERSION = "1";

/** Google's driving travel mode, spelled the same in both URL forms. */
const GOOGLE_MAPS_DRIVING_MODE = "driving";

/** Google Maps' iOS-only app scheme. See `googleMapsIosHref`. */
const GOOGLE_MAPS_IOS_SCHEME = "comgooglemaps://";

/**
 * The destination as the single string every scheme below wants, or `null` when
 * there is nowhere to go.
 *
 * Returned raw and encoded once, at each call site, rather than pre-encoded
 * here: encoding twice turns a Georgian street into percent-escaped
 * percent-escapes, and that bug is invisible until a driver's map app searches
 * for the literal text "%E1%83%95".
 *
 * Coordinates are sent as `"<lat>,<lng>"` — the one form both Apple and Google
 * accept — and are *not* rounded or reformatted. `toString` on a `Float` column
 * is exact, and trimming decimals here would move the pin.
 */
function destinationParameter(
  destination: NavigationDestination,
): string | null {
  switch (destination.kind) {
    case "coords":
      return `${destination.lat},${destination.lng}`;
    case "address":
      return destination.query;
    case "unavailable":
      return null;
  }
}

/**
 * Apple Maps, the iOS default: `maps://?daddr=<dest>&dirflg=d`.
 *
 * Chosen as the default target on iOS because it cannot dead-end — Apple Maps
 * is a system app that cannot be removed from the device, so this URL always
 * opens something.
 */
function appleMapsHref(destination: string): string {
  return `${APPLE_MAPS_SCHEME}?daddr=${encodeURIComponent(destination)}&dirflg=${APPLE_MAPS_DRIVING_FLAG}`;
}

/**
 * Google Maps for Android and the desktop:
 * `https://www.google.com/maps/dir/?api=1&destination=<dest>&travelmode=driving`.
 *
 * An `https` URL rather than an `intent://` or `geo:` scheme, deliberately: the
 * Google Maps app registers an intent filter for this exact host and path, so
 * an Android device opens the app while a desktop browser opens a tab — one
 * string, no platform branch, and nothing to fail on a phone without the app
 * installed.
 */
function googleMapsWebHref(destination: string): string {
  return `${GOOGLE_MAPS_DIRECTIONS_URL}?api=${GOOGLE_MAPS_API_VERSION}&destination=${encodeURIComponent(destination)}&travelmode=${GOOGLE_MAPS_DRIVING_MODE}`;
}

/**
 * Google Maps' own iOS app:
 * `comgooglemaps://?daddr=<dest>&directionsmode=driving`. `null` for a stop
 * with nowhere to go, on the same terms as `mapsHandoffHref`.
 *
 * **Not the iOS default, and the reason is a dead end that cannot be
 * detected.** `comgooglemaps://` silently does nothing when Google Maps is not
 * installed — no error, no fallback, no page change — and iOS exposes no way
 * for a web page to find out whether it is installed (`canOpenURL` is native
 * only, and the timing hacks that used to approximate it stopped working years
 * ago). A driver whose tap does nothing at all has no way to tell a broken
 * button from a slow one, so the default iOS target is the app that is
 * guaranteed to be on the device.
 *
 * Reachable in one supported way: `mapsHandoffHref(destination, "ios", true)`.
 * That is for a driver who has *told us* they prefer Google Maps — a stored
 * preference, not a guess — which is the only situation in which the dead end
 * above is an acceptable risk to take on their behalf.
 */
export function googleMapsIosHref(
  destination: NavigationDestination,
): string | null {
  const target = destinationParameter(destination);

  if (target === null) {
    return null;
  }

  return `${GOOGLE_MAPS_IOS_SCHEME}?daddr=${encodeURIComponent(target)}&directionsmode=${GOOGLE_MAPS_DRIVING_MODE}`;
}

/**
 * The URL to hand off to, or `null` when the stop cannot be navigated to.
 *
 * `null` is the signal to render `NAVIGATION_UNAVAILABLE_NOTE` **instead of**
 * the control, not to render a disabled one: a Navigate button that cannot
 * navigate is a thing a driver taps repeatedly at the kerb before concluding
 * the app is broken.
 *
 * `preferGoogleMaps` applies on iOS only — it is meaningless elsewhere, where
 * Google Maps is already the target — and defaults to `false` for the reason
 * `googleMapsIosHref` documents at length: the scheme it selects fails
 * silently on a device without the app.
 *
 * Every dynamic segment goes through `encodeURIComponent`, never into a
 * template raw. Georgian addresses are non-ASCII to begin with and free-text
 * ones routinely carry `&`, `#` and `?` — each of which truncates or corrupts
 * the query string it lands in, sending the driver to whatever prefix survived.
 */
export function mapsHandoffHref(
  destination: NavigationDestination,
  platform: MapsPlatform,
  preferGoogleMaps = false,
): string | null {
  if (platform === "ios" && preferGoogleMaps) {
    return googleMapsIosHref(destination);
  }

  const target = destinationParameter(destination);

  if (target === null) {
    return null;
  }

  return platform === "ios" ? appleMapsHref(target) : googleMapsWebHref(target);
}

/**
 * The one sentence shown in place of the control when there is nowhere to send
 * the driver.
 *
 * It does **not** say "use the address above", which is the obvious copy and a
 * lie: `toNavigationDestination` returns `"unavailable"` only when the stop has
 * no usable coordinates *and* no address text, so the address this would point
 * at is the blank that caused the note. It names the fact, then points at the
 * job details — the one part of this screen that is always there — rather than
 * at the contact block, whose columns (`Order.pickupContactPhone` and its five
 * siblings) are all nullable and may be just as empty.
 */
export const NAVIGATION_UNAVAILABLE_NOTE =
  "No map location for this stop — check the job details before setting off.";
