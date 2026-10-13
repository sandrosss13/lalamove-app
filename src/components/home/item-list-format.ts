/**
 * Display helpers for the item list picker's running load summary.
 *
 * This screen owns its formatting, per the house convention
 * `booking-format.ts` documents: a two-line `Intl` wrapper is copied rather
 * than shared, so another screen changing its precision cannot move these
 * figures.
 *
 * Every formatter is pinned to `en-GB` rather than the runtime's locale. The
 * tree hydrates, so a formatter reading the browser's locale would print one
 * string in Node and another in the browser; and the figures sit in
 * `--font-price` beside the fare, which is `en-GB` in both UI languages.
 *
 * The summary is an estimate of an estimate (catalogue weights are typical,
 * not weighed), so it is printed at the precision that is worth: whole
 * kilograms, a tenth of a cubic metre, a tenth of a metre per side. The leading
 * `~` belongs to the copy, not to these helpers.
 */

/** Whole kilograms, grouped: `1,240`. */
const WEIGHT_FORMAT = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
});

/** One decimal, always shown, so `2.0` and `2.1` line up in tabular figures. */
const ONE_DECIMAL_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** `1240.4` → `1,240 kg`. */
export function formatLoadWeightKg(weightKg: number): string {
  return `${WEIGHT_FORMAT.format(weightKg)} kg`;
}

/**
 * `2.06` → `2.1 m³`. A load under a twentieth of a cubic metre (a single
 * small box) would round to `0.0 m³` and read as nothing, so it is shown as
 * `<0.1 m³` instead.
 */
export function formatLoadVolumeM3(volumeM3: number): string {
  if (volumeM3 > 0 && volumeM3 < 0.05) {
    return `<${ONE_DECIMAL_FORMAT.format(0.1)} m³`;
  }
  return `${ONE_DECIMAL_FORMAT.format(volumeM3)} m³`;
}

/** `2, 0.9, 0.85` → `2.0 × 0.9 × 0.9 m` (length × width × height). */
export function formatLoadDimensionsM(
  lengthM: number,
  widthM: number,
  heightM: number,
): string {
  return `${[lengthM, widthM, heightM]
    .map((value) => ONE_DECIMAL_FORMAT.format(value))
    .join(" × ")} m`;
}

/** `1.2, 0.8` → `1.2 × 0.8 m`, for a pallet footprint. */
export function formatFootprintM(lengthM: number, widthM: number): string {
  return `${ONE_DECIMAL_FORMAT.format(lengthM)} × ${ONE_DECIMAL_FORMAT.format(widthM)} m`;
}
