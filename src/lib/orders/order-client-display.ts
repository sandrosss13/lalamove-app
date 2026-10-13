/**
 * "Who booked this order", for screens that show an order's client — the admin
 * console, carrier views, documents — now that an order may have **no** client
 * account.
 *
 * A guest order (`clientId: null`, see `src/lib/orders/guest-access.ts`) keeps
 * its booker's contact in four `guest*` columns, written at checkout. Every
 * screen that used to read `order.client.name` reads this instead, so the two
 * shapes are reconciled in one place rather than with a `?.` and a different
 * fallback on each page.
 *
 * Pure: takes whatever the caller already selected, imports nothing.
 */

/** The fields this helper reads. Select them all; any may be null. */
export type OrderClientDisplaySource = {
  client: { name: string | null; email: string | null } | null;
  guestFirstName: string | null;
  guestLastName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
};

/** What a screen shows for the order's client. */
export type OrderClientDisplay = {
  /** True for a guest order — no account behind it. */
  isGuest: boolean;
  /** The account's name, or the guest's "First Last"; `null` when a guest has
   *  not reached checkout yet (an unpaid guest order has no contact). */
  name: string | null;
  email: string | null;
  /** The guest's E.164 phone; `null` for an account order, whose phone lives
   *  on its `ClientProfile` and is read there by the screens that show it. */
  phone: string | null;
};

/** Prisma select fragment covering everything `orderClientDisplay` reads. */
export const ORDER_GUEST_CONTACT_SELECT = {
  guestFirstName: true,
  guestLastName: true,
  guestPhone: true,
  guestEmail: true,
} as const;

/** Resolve the order's client for display — the account, or the guest. */
export function orderClientDisplay(
  order: OrderClientDisplaySource,
): OrderClientDisplay {
  if (order.client) {
    return {
      isGuest: false,
      name: order.client.name,
      email: order.client.email,
      phone: null,
    };
  }

  const name =
    [order.guestFirstName, order.guestLastName]
      .map((part) => part?.trim() ?? "")
      .filter((part) => part !== "")
      .join(" ") || null;

  return {
    isGuest: true,
    name,
    email: order.guestEmail,
    phone: order.guestPhone,
  };
}
