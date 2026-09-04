/**
 * Money formatting for the public landing surface.
 *
 * This surface owns its own copy rather than importing a sibling's, for the
 * reason `src/components/driver-hub/screens/earnings-format.ts` records for
 * its own: a cross-screen import would tie the landing page's figures to a
 * file another screen is free to change, and a two-line `Intl` wrapper has
 * never earned a place in a shared module.
 *
 * Every fare figure in this app — `Order.price` and each component the pricing
 * engine returns — is already in GEL major units. Nothing is divided here.
 */

/**
 * Locale pinned rather than left to the browser: a visitor on a `de-DE`
 * locale reading `₾1.200,50` beside a hard-coded `₾0.40` sees two different
 * currencies. Two decimals, matching the driver hub's `₾142.60`.
 */
const gelFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `18.4` → `₾18.40`. */
export function formatGel(amountGel: number): string {
  return `₾${gelFormatter.format(amountGel)}`;
}
