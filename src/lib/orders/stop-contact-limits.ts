/**
 * Longest accepted value for each structured "Contact Info" field of a stop
 * (booking form dialog, `POST /api/orders`, `PATCH /api/orders/[id]`).
 *
 * Pure and dependency-free so the client dialog (`maxLength`) and the server
 * parser (`parseStopContact` in `order-input.ts`) read the same table: a bound
 * stated twice is a bound that drifts. Name and phone keep the shared
 * `FREE_TEXT_MAX_LENGTH` (200) they always had.
 */
export const STOP_CONTACT_MAX_LENGTHS = {
  name: 200,
  phone: 200,
  buildingName: 120,
  entrance: 40,
  /** Multi-line note for the driver: door code, lift code, where to park… */
  comment: 500,
} as const;
