import type { ContentLocale } from "@prisma/client";

import enDriverHub from "@/messages/en/driverHub.json";
import kaDriverHub from "@/messages/ka/driverHub.json";

/** A notification's two lines of text. */
export type NotificationCopy = { title: string; body: string };

/*
 * The wording of each notification, per language, read straight from the
 * catalogs: a notification is written in the driver's language — the one
 * their device registered with — not in that of whichever request happened to
 * create the offer or fire the alert, so the request translator is no use.
 *
 * Shared by the push senders and the in-app inbox, which records the same
 * text the push shows.
 */

/** A load offer — generic: nothing about the load is on a lock screen. */
export const OFFER_PUSH_COPY: Record<ContentLocale, NotificationCopy> = {
  EN: enDriverHub.offerPush,
  KA: kaDriverHub.offerPush,
};

/** A route alert firing — generic, like an offer's. */
export const ROUTE_ALERT_PUSH_COPY: Record<ContentLocale, NotificationCopy> = {
  EN: enDriverHub.routeAlertPush,
  KA: kaDriverHub.routeAlertPush,
};
