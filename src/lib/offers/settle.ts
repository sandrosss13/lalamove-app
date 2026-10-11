// Writes through Prisma; server code only.
import "server-only";

import { LoadOfferStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Close every live offer of a load a driver has just claimed: the winner's own
 * (if they held one) becomes `ACCEPTED`, everybody else's `WITHDRAWN`.
 *
 * Called by `claimOrderForDriver` after its compare-and-swap has committed, so
 * it covers a claim from the board as well as one from an offer. **It never
 * throws**: the claim is already the driver's, and losing this bookkeeping
 * changes nothing a client is told — `deriveOfferState` reads a pending offer
 * of a load that is no longer open as `WITHDRAWN` on its own.
 *
 * Offers already past their deadline are left for the sweep to mark `EXPIRED`,
 * which is what they are.
 */
export async function settleOffersAfterClaim(
  orderId: string,
  winnerDriverProfileId: string,
): Promise<void> {
  const now = new Date();
  const live = {
    orderId,
    status: LoadOfferStatus.PENDING,
    expiresAt: { gt: now },
  };

  try {
    await prisma.$transaction([
      prisma.loadOffer.updateMany({
        where: { ...live, driverProfileId: winnerDriverProfileId },
        data: { status: LoadOfferStatus.ACCEPTED, respondedAt: now },
      }),
      prisma.loadOffer.updateMany({
        where: { ...live, driverProfileId: { not: winnerDriverProfileId } },
        data: { status: LoadOfferStatus.WITHDRAWN },
      }),
    ]);
  } catch (error) {
    console.error("Failed to settle load offers after a claim:", error);
  }
}
