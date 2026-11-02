/**
 * Wire contract for a client's saved addresses (`/api/saved-addresses`).
 *
 * A saved address is one end of a past booking — the place plus the stop's
 * Contact Info and access details — that a signed-in CLIENT chose to keep so the
 * booking form can refill it in one tap. Only pure types and constants, so this
 * is safe in client components, route handlers and the Playwright pure specs.
 */

/** The most addresses one client can keep. Creating past it is a 409. */
export const SAVED_ADDRESS_LIMIT = 20;

/** Longest accepted label ("Home", "Office", "Warehouse 2"…). */
export const SAVED_ADDRESS_LABEL_MAX_LENGTH = 40;

/** A saved address as every endpoint returns it. */
export type SavedAddressDto = {
  id: string;
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
  contactName: string;
  contactPhone: string;
  buildingName: string;
  /** Entrance / staircase. */
  entrance: string;
  /** 0 = ground. */
  floor: number;
  passengerElevator: boolean;
  cargoElevator: boolean;
  /** Note for the driver (door code…). Always "" for a BUSINESS client. */
  comment: string;
  /** ISO timestamp. List order is lastUsedAt desc. */
  lastUsedAt: string;
};

/**
 * Body of `POST /api/saved-addresses` and (all fields optional) of
 * `PATCH /api/saved-addresses/[id]`. Strings are trimmed and cut to the
 * `STOP_CONTACT_MAX_LENGTHS` limits server-side; an empty label defaults to the
 * address itself.
 */
export type SavedAddressInput = Omit<SavedAddressDto, "id" | "lastUsedAt">;

/**
 * Endpoints (session-scoped to the signed-in CLIENT; 401 signed out, 403 for
 * any other role):
 *
 * - GET    /api/saved-addresses             → { addresses: SavedAddressDto[] }
 * - POST   /api/saved-addresses             → 201 { address } | 200 { address, duplicate: true }
 *     A duplicate is the same address string (case/whitespace-insensitive) for
 *     this client: its contact fields and label are updated instead of a new row.
 *     409 { error } when SAVED_ADDRESS_LIMIT is reached.
 * - PATCH  /api/saved-addresses/[id]        → { address }
 * - DELETE /api/saved-addresses/[id]        → 204
 * - POST   /api/saved-addresses/[id]/use    → 204 (bumps lastUsedAt; called by
 *     the booking form when a saved address is picked)
 *
 * 400 { error } on validation failure; 404 when the id is not this client's.
 */
