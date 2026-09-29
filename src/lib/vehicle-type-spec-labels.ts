import type { Translator } from "@/i18n/translator";

/**
 * Message keys for the seeded `VehicleTypeSpec` catalogue (`prisma/seed.ts`),
 * keyed by `VehicleTypeSpec.code`.
 *
 * `VehicleTypeSpec.label` is English seed data, so a screen that prints it
 * directly shows "Cargo Van" to a Georgian reader. The code is the stable
 * identifier, so the label is looked up by it; a code this map does not know
 * (a spec created after this list) falls back to the stored label rather than
 * to a key path.
 */
const VEHICLE_TYPE_SPEC_LABEL_KEYS: Readonly<Record<string, string>> = {
  MINIVAN: "common.vehicleTypeSpecs.minivan",
  MPV: "common.vehicleTypeSpecs.mpv",
  CARGO_VAN: "common.vehicleTypeSpecs.cargoVan",
  CLOSED_BOX_VAN: "common.vehicleTypeSpecs.closedBoxVan",
  REFRIGERATED_VAN: "common.vehicleTypeSpecs.refrigeratedVan",
  BOX_TRUCK: "common.vehicleTypeSpecs.boxTruck",
  FLATBED_TRUCK: "common.vehicleTypeSpecs.flatbedTruck",
  CURTAINSIDER_TRUCK: "common.vehicleTypeSpecs.curtainsiderTruck",
  REFRIGERATED_TRUCK: "common.vehicleTypeSpecs.refrigeratedTruck",
  LARGE_FREIGHT_TRUCK: "common.vehicleTypeSpecs.largeFreightTruck",
  TRAILER_TRUCK: "common.vehicleTypeSpecs.trailerTruck",
};

/**
 * A `VehicleTypeSpec`'s display label in the reader's language.
 *
 * `t` is a root-namespace translator (`useTranslations()` /
 * `getTranslations()` with no namespace). Without one — or for a code with no
 * key — the stored English `label` is returned unchanged.
 */
export function vehicleTypeSpecLabel(
  code: string,
  label: string,
  t?: Translator,
): string {
  const key = VEHICLE_TYPE_SPEC_LABEL_KEYS[code];

  return key === undefined || t === undefined ? label : t(key);
}
