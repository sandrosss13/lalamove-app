/**
 * Constants shared by the three saved-card routes: the collection route
 * (`GET`/`POST`), the single-card route (`DELETE`) and the default-promotion
 * route (`POST`). They have to agree between the three — a field one route
 * returns must be returned by all of them, and an ownership failure must read
 * the same whichever route reports it — so they live in one place rather than
 * being duplicated per handler.
 *
 * A `route.ts` may only export request handlers and the route segment config,
 * so a shared constant cannot live in one; this co-located module is where it
 * goes instead.
 */

/**
 * The only columns any saved-card route ever reads back.
 *
 * `providerToken` is deliberately absent and must stay absent: it is the
 * gateway's handle for a card, and nothing on the client needs it. Selecting a
 * fixed field list rather than the whole row means a column added later cannot
 * start leaking through these responses by accident.
 */
export const CARD_SELECT = {
  id: true,
  brand: true,
  last4: true,
  expMonth: true,
  expYear: true,
  holderName: true,
  isDefault: true,
  createdAt: true,
} as const;

/**
 * The message every ownership failure answers with. A card belonging to someone
 * else is reported as "not found" rather than "forbidden": a 403 would confirm
 * that the id exists, letting a caller enumerate other clients' cards.
 */
export const CARD_NOT_FOUND = "Card not found.";
