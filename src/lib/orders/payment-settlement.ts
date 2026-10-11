// Writes to the database through Prisma, so it can never be part of a browser
// bundle. Fails the build loudly if a client component ever imports it.
import "server-only";

// `OrderStatus` is imported as a value, not just a type: both the conditional
// `where` and the write below name its members.
import { OrderStatus } from "@prisma/client";
import type { Order } from "@prisma/client";

import { runMatchingWithinBudget } from "@/lib/background/request-budget";
import { dispatchOffersForLoad } from "@/lib/offers/dispatch";
import { prisma } from "@/lib/prisma";
import { dispatchRouteAlertsForLoad } from "@/lib/route-alerts/dispatch";

/**
 * Settles payment for one order and, in doing so, puts it on the open market:
 * `INITIATED` (created, unpaid, invisible to drivers and companies) → `PENDING`
 * (biddable by every eligible driver and company).
 *
 * **This file is the single seam a real payment gateway hooks into**, and it
 * has two halves. This function is the first: where the charge will be made.
 * The second is `confirmGatewayPayment` (re-exported at the foot of this file):
 * what the gateway calls once it holds the client's money, which is the only
 * thing that lets a job credit a driver's wallet. No provider is
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
 * `count` is deliberately not treated as a failure: zero rows updated means the
 * order was already settled, which satisfies this function's postcondition just
 * as well as having settled it here, so it is a success and not a 409.
 *
 * `count` is read for one thing: this is the moment a load becomes open to
 * drivers, so the call that actually made the transition also pushes the load
 * to the nearest eligible online drivers as offers. Only that call does — a
 * repeat settles nothing and offers nothing. `dispatchOffersForLoad` never
 * throws; a matching failure leaves the order settled and on the board, which
 * is all this function promises. The same moment fires the drivers' saved
 * route alerts (`dispatchRouteAlertsForLoad`), on the same terms.
 *
 * **Neither can hold the client's checkout.** The two run under one time
 * budget (`runMatchingWithinBudget`): this function waits for them for at most
 * `MATCHING_BUDGET_MS` and then returns, and whatever is unfinished completes
 * after the response. Matching is for drivers; the client paying is owed an
 * answer about their payment, not about who was offered the job.
 */
export async function settleOrderPayment(orderId: string): Promise<Order> {
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, status: OrderStatus.INITIATED },
    data: { status: OrderStatus.PENDING },
  });

  if (count > 0) {
    await runMatchingWithinBudget(async () => {
      await dispatchOffersForLoad(orderId);
      // After the offers, so a driver just offered this load is not also sent
      // a route alert about it. Inside the same budget, so the order holds
      // even when the first half is slow enough to be finished after the
      // response.
      await dispatchRouteAlertsForLoad(orderId);
    });
  }

  // Read back rather than assumed, so the caller reports the status the database
  // actually holds. `findUniqueOrThrow` rather than `findUnique` because every
  // caller settles an order it has just created or already read: a missing row
  // is a broken invariant worth failing loudly on, not a null to thread through
  // each call site.
  return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}

/**
 * The seam's second half: a gateway's confirmation that it has received the
 * client's funds. Implemented in `./gateway-confirmation` — kept apart only so
 * the local simulation script can load it without this module's push and
 * matching imports — and exported from here because this file is where a
 * gateway integration is written.
 */
export {
  confirmGatewayPayment,
  type GatewayConfirmation,
  type GatewayConfirmationOutcome,
} from "@/lib/orders/gateway-confirmation";
