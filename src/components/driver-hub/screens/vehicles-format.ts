/**
 * Display helpers shared by the Vehicles screen, its detail panel and its add
 * form.
 *
 * Kept out of `hub-primitives.tsx` on purpose: these are Vehicles-specific
 * renderings (a payload in kilograms, a pluralised count), not part of
 * the vocabulary the other six screens compose from. They live in their own
 * module rather than in `vehicles-screen.tsx` so the panel and the form can
 * reach them without importing the screen that renders them.
 *
 * Formatting only — nothing here decides what a number *means*, which is the
 * loader's job (`src/lib/dashboard/hub/vehicles.ts`).
 */

/**
 * `en-GB` rather than the browser's locale, so the thousands separator is the
 * design's `,` whatever locale the viewer's browser runs in.
 */
const INTEGER_FORMAT = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
});

/** What the design prints where a figure is genuinely not known. */
export const EMPTY_VALUE = "—";

/** `1200` → `1,200 kg`. */
export function formatKilograms(kilograms: number): string {
  return `${INTEGER_FORMAT.format(kilograms)} kg`;
}

/** `1, "vehicle"` → `"1 vehicle"`; `3` → `"3 vehicles"`. */
export function pluralise(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}
