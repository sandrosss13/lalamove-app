/**
 * The rules of push delivery, as pure functions: what a device token looks
 * like, whether sending is configured, what a message carries, and which
 * tokens Expo's answer says to forget.
 *
 * No runtime dependency on Prisma, Next or `server-only`, so
 * `tests/push-rules.spec.ts` pins all of it without a server. The I/O lives in
 * `src/lib/push/sender.ts`.
 *
 * Written against Expo's push API as documented at
 * https://docs.expo.dev/push-notifications/sending-notifications/ .
 */

/** Expo's push endpoint. One POST carries up to 100 messages. */
export const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";

/** Expo's documented per-request message limit. */
export const EXPO_PUSH_MAX_MESSAGES_PER_REQUEST = 100;

/**
 * How many devices one account may have registered. The oldest (by last seen)
 * is dropped beyond this, so a token churned by reinstalls cannot pile up.
 */
export const MAX_DEVICE_TOKENS_PER_USER = 10;

/** `DevicePlatform` in `prisma/schema.prisma`, spelled without Prisma. */
export const DEVICE_PLATFORMS = ["IOS", "ANDROID"] as const;

export type DevicePlatformName = (typeof DEVICE_PLATFORMS)[number];

/** Generous upper bound on the bracketed part of a token; real ones are ~22. */
const MAX_TOKEN_BODY_LENGTH = 200;

const EXPO_PUSH_TOKEN_PATTERN = new RegExp(
  `^(?:ExponentPushToken|ExpoPushToken)\\[[^\\[\\]\\s]{1,${MAX_TOKEN_BODY_LENGTH}}\\]$`,
);

/** `ExponentPushToken[…]` or `ExpoPushToken[…]` — the two forms Expo issues. */
export function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && EXPO_PUSH_TOKEN_PATTERN.test(value);
}

/**
 * The platform a registration names, or null. Accepts React Native's
 * `Platform.OS` spelling ("ios", "android") as well as the enum's.
 */
export function parseDevicePlatform(value: unknown): DevicePlatformName | null {
  if (typeof value !== "string") {
    return null;
  }

  const upper = value.trim().toUpperCase();

  return DEVICE_PLATFORMS.find((platform) => platform === upper) ?? null;
}

export type PushEnvironment = {
  nodeEnv: string | undefined;
  expoPushEnabled: string | undefined;
  expoAccessToken: string | undefined;
  expoPushApiUrl: string | undefined;
};

export type PushConfig =
  | { enabled: false }
  | { enabled: true; url: string; accessToken: string | null };

/**
 * Whether push is switched on, and where it goes.
 *
 * Off unless `EXPO_PUSH_ENABLED` is exactly `"true"`: a deployment that has
 * not been set up for push sends nothing rather than guessing.
 *
 * `EXPO_PUSH_API_URL` redirects sending to a stand-in for local verification
 * and is ignored when `NODE_ENV` is `production`, so no production setting can
 * route device tokens anywhere but Expo.
 */
export function resolvePushConfig(environment: PushEnvironment): PushConfig {
  if (environment.expoPushEnabled?.trim() !== "true") {
    return { enabled: false };
  }

  const override = environment.expoPushApiUrl?.trim() ?? "";
  const accessToken = environment.expoAccessToken?.trim() ?? "";

  return {
    enabled: true,
    url:
      environment.nodeEnv !== "production" && override !== ""
        ? override
        : EXPO_PUSH_SEND_URL,
    accessToken: accessToken === "" ? null : accessToken,
  };
}

/** The `data.type` of an offer push — what the app routes on. */
export const LOAD_OFFER_PUSH_TYPE = "LOAD_OFFER";

/** The `data.type` of a route-alert push. */
export const ROUTE_ALERT_PUSH_TYPE = "ROUTE_ALERT";

/** What a push carries for the app to route on: ids, and nothing else. */
export type PushData =
  | { type: typeof LOAD_OFFER_PUSH_TYPE; offerId: string }
  | { type: typeof ROUTE_ALERT_PUSH_TYPE; alertId: string; orderId: string };

/** One message in Expo's format. Only the fields this backend sets. */
export type PushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  /** `high` wakes the device now; `default` lets the OS batch it. */
  priority: "high" | "default";
  /** Seconds Expo keeps trying to deliver; after that the push is dropped. */
  ttl: number;
  data: PushData;
};

/**
 * The push for one new offer to one device.
 *
 * **It carries the offer id and generic wording, and nothing about the load** —
 * no address, name, cargo or amount. A notification is shown on a lock screen
 * and passes through Expo, Apple and Google; the app fetches the offer itself,
 * over its own session, once opened.
 *
 * `ttl` is the offer's remaining lifetime: a push that could not be delivered
 * while the offer was answerable is not worth delivering afterwards.
 */
export function buildOfferPushMessage(input: {
  token: string;
  offerId: string;
  title: string;
  body: string;
  ttlSeconds: number;
}): PushMessage {
  return {
    to: input.token,
    title: input.title,
    body: input.body,
    sound: "default",
    priority: "high",
    ttl: Math.max(1, Math.ceil(input.ttlSeconds)),
    data: { type: LOAD_OFFER_PUSH_TYPE, offerId: input.offerId },
  };
}

/**
 * The push for one route alert to one device.
 *
 * Like an offer push it names ids only — the alert that matched and the load —
 * and **nothing about the load itself**: no city, address, name or amount.
 * The app opens the load from the board over its own session.
 *
 * Normal priority: an alert is a heads-up, not a 30-second countdown.
 */
export function buildRouteAlertPushMessage(input: {
  token: string;
  alertId: string;
  orderId: string;
  title: string;
  body: string;
  ttlSeconds: number;
}): PushMessage {
  return {
    to: input.token,
    title: input.title,
    body: input.body,
    sound: "default",
    priority: "default",
    ttl: Math.max(1, Math.ceil(input.ttlSeconds)),
    data: {
      type: ROUTE_ALERT_PUSH_TYPE,
      alertId: input.alertId,
      orderId: input.orderId,
    },
  };
}

/** The ticket error that means "stop sending to this token". */
const DEVICE_NOT_REGISTERED = "DeviceNotRegistered";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The tokens Expo's answer says are dead, to be deleted.
 *
 * Expo answers a send with `{ data: [ticket, …] }`, one ticket per message in
 * request order; a dead token's ticket is `{ status: "error", details:
 * { error: "DeviceNotRegistered" } }`. Only that error prunes — every other
 * one (`MessageTooBig`, `MessageRateExceeded`, …) is about the message or the
 * moment, not the device.
 *
 * Anything that is not that shape — a whole-request `{ errors: […] }`, a ticket
 * count that does not match the messages sent — prunes nothing: with the
 * pairing in doubt, deleting a working token is the worse mistake.
 */
export function tokensToPrune(
  sentTokens: readonly string[],
  responseBody: unknown,
): string[] {
  if (!isRecord(responseBody) || !Array.isArray(responseBody.data)) {
    return [];
  }

  const tickets: unknown[] = responseBody.data;

  if (tickets.length !== sentTokens.length) {
    return [];
  }

  return sentTokens.filter((_, index) => {
    const ticket = tickets[index];

    return (
      isRecord(ticket) &&
      ticket.status === "error" &&
      isRecord(ticket.details) &&
      ticket.details.error === DEVICE_NOT_REGISTERED
    );
  });
}

/** `messages` in runs of at most `size`, in order. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
