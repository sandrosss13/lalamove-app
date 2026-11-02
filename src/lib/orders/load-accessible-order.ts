/**
 * The one loader client-facing pages use to read an order that may be either
 * an account order or a guest order — checkout, the success page, and anything
 * else a guest reaches with the cookie `POST /api/orders` set.
 *
 * It tries the two ownership proofs in a fixed order:
 *
 * 1. a signed-in CLIENT session, scoped by `clientId` — exactly the query those
 *    pages ran before guest checkout existed;
 * 2. the order's guest cookie, scoped by `clientId: null` plus the token hash
 *    (see `src/lib/orders/guest-access.ts`).
 *
 * Falling through to the cookie when the session finds nothing covers the one
 * case "session wins" would get wrong: someone who booked as a guest and then
 * signed in (or was already signed in to a different role in that browser).
 * The cookie still proves they booked it, so they still see it.
 *
 * `null` means neither proof matched — "not yours" and "does not exist" are the
 * same answer here, as everywhere else on the client surface.
 */

import "server-only";

import type { Prisma } from "@prisma/client";

import {
  orderAccessWhere,
  readGuestOrderToken,
  type OrderAccess,
} from "@/lib/orders/guest-access";
import { prisma } from "@/lib/prisma";

/** What `loadAccessibleOrder` found, and which proof found it. */
export type AccessibleOrder<S extends Prisma.OrderSelect> = {
  order: Prisma.OrderGetPayload<{ select: S }>;
  access: OrderAccess;
};

/**
 * Load `orderId` with `select`, if the current request may see it: as its
 * signed-in client first, then as the guest holding its cookie.
 */
export async function loadAccessibleOrder<S extends Prisma.OrderSelect>(
  orderId: string,
  session: { user: { id: string; role?: string | null } } | null,
  select: S,
): Promise<AccessibleOrder<S> | null> {
  const attempts: OrderAccess[] = [];

  if (session?.user.role === "CLIENT") {
    attempts.push({ kind: "client", userId: session.user.id });
  }

  // Read up front even on the signed-in path: a request cookie costs nothing
  // to read, and listing both attempts before querying keeps the order of
  // precedence in one place.
  const token = await readGuestOrderToken(orderId);
  if (token) {
    attempts.push({ kind: "guest", token });
  }

  for (const access of attempts) {
    // Cast because Prisma cannot narrow a generic `select` through
    // `findFirst`'s overloads; the payload type is exactly what it returns.
    const order = (await prisma.order.findFirst({
      where: orderAccessWhere(orderId, access),
      select,
    })) as Prisma.OrderGetPayload<{ select: S }> | null;

    if (order) {
      return { order, access };
    }
  }

  return null;
}

/**
 * A where-clause matching `orderId` only if the request may act on it as its
 * owner — booked by the signed-in user (**any** role, the way the account-order
 * routes always scoped by `clientId: session.user.id`), or carrying the order's
 * guest cookie. `null` when the request carries neither proof, which callers
 * answer as unauthenticated.
 *
 * For write routes that take one query, not a page: both proofs go into one
 * `OR`, so ownership stays a single conditional lookup and "not yours" and
 * "does not exist" remain the same empty answer.
 */
export async function ownedOrderWhere(
  orderId: string,
  session: { user: { id: string } } | null,
): Promise<Prisma.OrderWhereInput | null> {
  const candidates: Prisma.OrderWhereInput[] = [];

  if (session) {
    candidates.push(
      orderAccessWhere(orderId, { kind: "client", userId: session.user.id }),
    );
  }

  const token = await readGuestOrderToken(orderId);
  if (token) {
    candidates.push(orderAccessWhere(orderId, { kind: "guest", token }));
  }

  if (candidates.length === 0) {
    return null;
  }

  return candidates.length === 1 ? candidates[0]! : { OR: candidates };
}
