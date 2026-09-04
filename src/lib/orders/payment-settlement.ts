// Writes to the database through Prisma, so it can never be part of a browser
// bundle. Fails the build loudly if a client component ever imports it.
import "server-only";

// `OrderStatus` is imported as a value, not just a type: both the conditional
// `where` and the write below name its members.
import { OrderStatus } from "@prisma/client";
import type { Order } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Settles payment for one order and, in doing so, puts it on the open market:
 * `INITIATED` (created, unpaid, invisible to drivers and companies) → `PENDING`
 * (biddable by every eligible driver and company).
 *
 * **This is the single seam a real payment gateway hooks into.** No provider is
 * integrated — see the `SavedCard` model doc — so nothing here can take money:
 * `CASH`, the method a client sees labelled "Pay later", is collected off
 * platform when the job is done, and `CARD` records an intention against a
 * card's display details with no gateway behind it to authorise. Every enabled
 * method therefore settles instantly, and "settled" means *nothing to collect up
 * front*, **not** *money received*. When a provider is chosen, the charge goes
 * here and the hop to `PENDING` becomes conditional on it succeeding; keeping
 * that decision in one named function is the point of the seam, so that wiring a
 * gateway is one edit rather than a hunt for scattered gates.
 *
 * Safe to call more than once. The write is conditional on the order still being
 * `INITIATED`, so an order already on the market — or beyond it, at `ACCEPTED`
 * or `CANCELLED` — is left exactly where it is rather than dragged backwards.
 * `count` is deliberately not checked: zero rows updated means the order was
 * already settled, which satisfies this function's postcondition just as well as
 * having settled it here, so it is a success and not a 409.
 */
export async function settleOrderPayment(orderId: string): Promise<Order> {
  await prisma.order.updateMany({
    where: { id: orderId, status: OrderStatus.INITIATED },
    data: { status: OrderStatus.PENDING },
  });

  // Read back rather than assumed, so the caller reports the status the database
  // actually holds. `findUniqueOrThrow` rather than `findUnique` because every
  // caller settles an order it has just created or already read: a missing row
  // is a broken invariant worth failing loudly on, not a null to thread through
  // each call site.
  return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}
