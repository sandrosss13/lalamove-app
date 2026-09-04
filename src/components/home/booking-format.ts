/**
 * Display helpers for the booking form and the components it composes from.
 *
 * This screen owns its money formatting. A cross-screen import would tie the
 * booking form's figures to a file another screen is free to change — the same
 * trade `src/components/driver-hub/screens/earnings-format.ts:11-15` documents
 * for the hub's three copies of `formatGel`. A two-line `Intl` wrapper has
 * never earned a place in a shared module here.
 *
 * Every formatter is locale-pinned rather than left to the runtime's own
 * locale: this tree hydrates, so a formatter reading the browser's locale would
 * produce one string in Node and another in the browser, and a client on a
 * `de-DE` locale would read `₾1.200,50` beside a hard-coded `₾0.40` and see two
 * different currencies.
 */

/**
 * `en-GB` with exactly two decimals — the precision every fare component is
 * quoted at.
 *
 * `Order.price` and each component of the fare breakdown are already in GEL
 * major units, so nothing is divided here.
 */
const GEL_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * The quoted route length, to the tenth of a kilometre — the precision an
 * estimate is worth, since the price it drives is itself an estimate.
 *
 * Grouping is off in both distance formatters so the figures stay identical to
 * the `toFixed` calls they replace. Money groups (a fare can plausibly run to
 * four digits); a road distance on this map cannot.
 */
const DISTANCE_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: false,
});

/**
 * The distance a booked order was actually priced at, to two decimals — the
 * figure is a record of what was charged rather than a live estimate, so it is
 * printed at the precision the server returned it.
 */
const BOOKED_DISTANCE_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

/** `18.4` → `₾18.40`. */
export function formatGel(amountGel: number): string {
  return `₾${GEL_FORMAT.format(amountGel)}`;
}

/** `12.34` → `12.3 km`, for the live price breakdown. */
export function formatDistanceKm(distanceKm: number): string {
  return `${DISTANCE_FORMAT.format(distanceKm)} km`;
}

/** `12.345` → `12.35 km`, for the confirmation panel of a booked order. */
export function formatBookedDistanceKm(distanceKm: number): string {
  return `${BOOKED_DISTANCE_FORMAT.format(distanceKm)} km`;
}
