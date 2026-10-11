// Reads device tokens through Prisma and sends through the push service;
// server code only.
import "server-only";

import type { ContentLocale } from "@prisma/client";

import enDriverHub from "@/messages/en/driverHub.json";
import kaDriverHub from "@/messages/ka/driverHub.json";
import { usersAcceptingPush } from "@/lib/notifications/settings";
import { secondsRemaining } from "@/lib/offers/rules";
import { prisma } from "@/lib/prisma";
import { buildOfferPushMessage } from "@/lib/push/rules";
import { getPushSender } from "@/lib/push/sender";

/** A just-created offer, reduced to what its push needs. */
export type OfferToNotify = {
  id: string;
  /** The driver's `User.id` — device tokens are registered per account. */
  userId: string;
  expiresAt: Date;
};

/**
 * The notification's wording per language, read straight from the catalogs:
 * a push is written in the language of the device it goes to, not of whichever
 * request happened to create the offer, so the request translator is no use.
 */
const OFFER_PUSH_COPY: Record<ContentLocale, { title: string; body: string }> =
  {
    EN: enDriverHub.offerPush,
    KA: kaDriverHub.offerPush,
  };

/**
 * Push each new offer to its driver's devices.
 *
 * **Never throws and is never awaited by a request**: the offer already exists
 * and the app's own poll finds it; a push only makes that sooner. With push
 * unconfigured this returns before touching the database.
 *
 * A driver who switched the offers category off in their notification
 * settings is skipped — the offer still exists and their app still polls it.
 *
 * Only devices whose session is still valid are sent to — sign-out deletes the
 * session and its tokens with it; this also covers one that merely expired.
 * Tokens the push service reports dead are deleted.
 */
export async function notifyOffersCreated(
  offers: readonly OfferToNotify[],
): Promise<void> {
  try {
    const sender = getPushSender();

    if (!sender.enabled || offers.length === 0) {
      return;
    }

    const now = new Date();
    const offerByUserId = new Map(offers.map((offer) => [offer.userId, offer]));

    // The driver's own notification settings: a driver who switched "New load
    // offers" off is not pushed one. Offers are an urgent category, so quiet
    // hours do not hold them back — see `shouldSendPush`.
    const recipients = await usersAcceptingPush(
      "LOAD_OFFERS",
      [...offerByUserId.keys()],
      now,
    );

    if (recipients.size === 0) {
      return;
    }

    const devices = await prisma.deviceToken.findMany({
      where: {
        userId: { in: [...recipients] },
        session: { expiresAt: { gt: now } },
      },
      select: { userId: true, token: true, locale: true },
    });

    const messages = devices.flatMap((device) => {
      const offer = offerByUserId.get(device.userId);

      return offer === undefined
        ? []
        : [
            buildOfferPushMessage({
              token: device.token,
              offerId: offer.id,
              ...OFFER_PUSH_COPY[device.locale],
              ttlSeconds: secondsRemaining(offer.expiresAt, now),
            }),
          ];
    });

    if (messages.length === 0) {
      return;
    }

    const { invalidTokens } = await sender.send(messages);

    if (invalidTokens.length > 0) {
      await prisma.deviceToken.deleteMany({
        where: { token: { in: invalidTokens } },
      });
    }
  } catch (error) {
    console.error("Failed to push load offers:", error);
  }
}
