/**
 * The rules of the driver's in-app notification inbox, as pure functions:
 * which language an entry is written in, how a page is asked for, what a
 * "mark as read" body may hold, and how a row goes on the wire.
 *
 * No runtime dependency on Prisma, Next or `server-only`, so
 * `tests/notification-inbox-rules.spec.ts` pins all of it without a server.
 * The I/O lives in `src/lib/notifications/inbox.ts` and the two routes under
 * `src/app/api/dashboard/hub/notifications`.
 */

import type { HubDriverNotification } from "@/lib/mobile-api/contracts";

/** `ContentLocale` in `prisma/schema.prisma`, spelled without Prisma. */
export type InboxLocale = "KA" | "EN";

/**
 * The language of an entry when the driver has no device registered: the
 * platform's default (`DEFAULT_LOCALE` in `src/i18n/routing.ts`, Georgian).
 */
export const DEFAULT_INBOX_LOCALE: InboxLocale = "KA";

/** A page of `GET /api/dashboard/hub/notifications` when none is asked for. */
export const DEFAULT_INBOX_PAGE_SIZE = 20;

/** The largest page that may be asked for. */
export const MAX_INBOX_PAGE_SIZE = 50;

/** How many ids one "mark as read" may name. Beyond it the body is refused. */
export const MAX_MARK_READ_IDS = 200;

/** Generous upper bound on an id (a cuid is 25). */
const MAX_ID_LENGTH = 64;

/**
 * Which language a driver's inbox entry is written in: that of the device
 * they used most recently — what a push to them is written in — or the
 * platform default when they have none.
 */
export function pickInboxLocale(
  devices: readonly { locale: InboxLocale; lastSeenAt: Date }[],
): InboxLocale {
  let latest: { locale: InboxLocale; lastSeenAt: Date } | null = null;

  for (const device of devices) {
    if (latest === null || device.lastSeenAt > latest.lastSeenAt) {
      latest = device;
    }
  }

  return latest?.locale ?? DEFAULT_INBOX_LOCALE;
}

/**
 * The page size `?limit=` asks for. Lenient by design — a missing or garbled
 * value is the default, an out-of-range one is clamped — because a list a
 * client can always read is worth more than a 400 over a query string.
 */
export function parseInboxLimit(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw.trim())) {
    return DEFAULT_INBOX_PAGE_SIZE;
  }

  return Math.min(MAX_INBOX_PAGE_SIZE, Math.max(1, Number(raw.trim())));
}

function isId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    value.length <= MAX_ID_LENGTH
  );
}

/** `?cursor=` — the id of the last entry already shown — or null. */
export function parseInboxCursor(raw: string | null): string | null {
  return raw !== null && isId(raw.trim()) ? raw.trim() : null;
}

export type MarkReadRefusal =
  "BODY_NOT_AN_OBJECT" | "IDS_NOT_A_LIST" | "TOO_MANY_IDS";

/**
 * What a `POST …/notifications/read` body asks for: `{ ids: [...] }` names
 * entries, while an absent body, `{}`, `ids: null` or `ids: []` is "all of
 * them". `undefined` is a request that sent no body at all.
 */
export function parseMarkReadBody(
  body: unknown,
): { ids: string[] | "ALL" } | { refusal: MarkReadRefusal } {
  if (body === undefined) {
    return { ids: "ALL" };
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { refusal: "BODY_NOT_AN_OBJECT" };
  }

  const { ids } = body as Record<string, unknown>;

  if (ids === undefined || ids === null) {
    return { ids: "ALL" };
  }

  if (!Array.isArray(ids) || !ids.every(isId)) {
    return { refusal: "IDS_NOT_A_LIST" };
  }

  if (ids.length > MAX_MARK_READ_IDS) {
    return { refusal: "TOO_MANY_IDS" };
  }

  return ids.length === 0 ? { ids: "ALL" } : { ids: [...new Set(ids)] };
}

/** The `DriverNotification` columns an entry is answered from. */
export type InboxRow = {
  id: string;
  type: HubDriverNotification["type"];
  title: string;
  body: string;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
};

/**
 * One row as the app receives it. `data` is the push's `data` object; anything
 * stored that is not a plain object (there is no writer of one) is answered
 * as null rather than as something the app would have to guard against.
 */
export function toHubDriverNotification(row: InboxRow): HubDriverNotification {
  const data =
    typeof row.data === "object" &&
    row.data !== null &&
    !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : null;

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt === null ? null : row.readAt.toISOString(),
  };
}

/**
 * A page of rows fetched `limit + 1` at a time, split into the page and the
 * cursor for the next one (null when this is the last).
 */
export function toInboxPage<R extends { id: string }>(
  rows: readonly R[],
  limit: number,
): { page: R[]; nextCursor: string | null } {
  const page = rows.slice(0, limit);

  return {
    page,
    nextCursor:
      rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
  };
}
