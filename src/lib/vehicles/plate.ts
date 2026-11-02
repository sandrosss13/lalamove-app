/**
 * Canonical spelling of a vehicle or trailer plate, shared by every route that
 * writes `Vehicle.plateNumber` / `Vehicle.trailerPlateNumber` and by the
 * client-side duplicate checks.
 *
 * Hyphens and whitespace are dropped and letters upper-cased, so "aa-123-bb",
 * "AA 123 BB" and "AA123BB" are one plate to the globally unique
 * `plateNumber` index rather than three.
 *
 * Pure: no server-only imports, so client components and Playwright specs can
 * load it directly.
 */
export function normalizePlate(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}
