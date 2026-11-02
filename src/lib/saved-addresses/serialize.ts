/**
 * The columns the saved-address routes read back, and how a row becomes the
 * wire `SavedAddressDto`. Shared by every route under `/api/saved-addresses`
 * so a field one returns is returned by all of them.
 *
 * Pure (a `type`-only Prisma import), so the Playwright pure specs can use it.
 */

import type { Prisma } from "@prisma/client";

import type { SavedAddressDto } from "./contract";

/**
 * A fixed field list rather than the whole row: `clientId`, `createdAt` and
 * `updatedAt` stay server-side, and a column added later cannot start leaking
 * through these responses by accident.
 */
export const SAVED_ADDRESS_SELECT = {
  id: true,
  label: true,
  address: true,
  lat: true,
  lng: true,
  contactName: true,
  contactPhone: true,
  buildingName: true,
  entrance: true,
  floor: true,
  passengerElevator: true,
  cargoElevator: true,
  comment: true,
  lastUsedAt: true,
} as const satisfies Prisma.SavedAddressSelect;

export type SavedAddressRow = Prisma.SavedAddressGetPayload<{
  select: typeof SAVED_ADDRESS_SELECT;
}>;

/**
 * Row → DTO. `isBusiness` blanks the comment on the way out too, so a row
 * written before the client switched to a business account never shows a
 * driver note the booking would drop anyway.
 */
export function toSavedAddressDto(
  row: SavedAddressRow,
  isBusiness = false,
): SavedAddressDto {
  return {
    ...row,
    comment: isBusiness ? "" : row.comment,
    lastUsedAt: row.lastUsedAt.toISOString(),
  };
}

/**
 * Every ownership failure answers with this. Another client's address is "not
 * found" rather than "forbidden", so a caller cannot probe for ids that exist.
 */
export const SAVED_ADDRESS_NOT_FOUND_KEY =
  "errors.savedAddresses.addressNotFound";
