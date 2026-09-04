/**
 * Display helpers shared by the Vehicles screen, its detail panel and its add
 * form.
 *
 * Kept out of `hub-primitives.tsx` on purpose: these are Vehicles-specific
 * renderings (a plate's odometer, a fleet's cost per kilometre), not part of
 * the vocabulary the other six screens compose from. They live in their own
 * module rather than in `vehicles-screen.tsx` so the panel and the form can
 * reach them without importing the screen that renders them.
 *
 * Formatting only — nothing here decides what a number *means*, which is the
 * loader's job (`src/lib/dashboard/hub/vehicles.ts`).
 */

/**
 * `en-GB` rather than the browser's locale: the design's figures are written
 * with a `.` decimal separator and a `,` thousands separator throughout, and a
 * driver on a `de-DE` browser reading `₾1.200,50` next to a hard-coded `₾0.40`
 * would see two different currencies.
 */
const GEL_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INTEGER_FORMAT = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
});

/** What the design prints where a figure is genuinely not known. */
export const EMPTY_VALUE = "—";

/** `18.4` → `₾18.40`. GEL major units, matching `Order.price`. */
export function formatGel(amountGel: number): string {
  return `₾${GEL_FORMAT.format(amountGel)}`;
}

/** `1200` → `1,200 kg`. */
export function formatKilograms(kilograms: number): string {
  return `${INTEGER_FORMAT.format(kilograms)} kg`;
}

/**
 * `184210` → `184.2k km`, the design's compact odometer reading.
 *
 * Zero renders as an em dash rather than `0.0k km`: the sample module's neutral
 * fallback for a vehicle it has no entry for *is* zero, and a brand-new fleet
 * van showing "0.0k km" reads as a real reading of nothing rather than as the
 * "we do not track this yet" it actually means.
 */
export function formatOdometer(odometerKm: number): string {
  if (odometerKm <= 0) {
    return EMPTY_VALUE;
  }

  return `${(odometerKm / 1000).toFixed(1)}k km`;
}

/** `1, "vehicle"` → `"1 vehicle"`; `3` → `"3 vehicles"`. */
export function pluralise(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}
