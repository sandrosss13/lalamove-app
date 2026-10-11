/**
 * The rules of a driver's support message — its topics and its limits — with
 * nothing else attached.
 *
 * No runtime imports, so `tests/support-message-rules.spec.ts` pins them
 * without a server or a database, and so the admin page (a client component)
 * can import the topic list without dragging Prisma into the browser.
 */

/**
 * What a message is about. Two screens send one, each with its own list.
 *
 * The **Support** screen's radio list, in the design's order
 * (`SUPPORT_SCREEN_TOPICS`):
 *
 * | Value                      | Design copy                        |
 * | -------------------------- | ---------------------------------- |
 * | `PICKUP_OR_DROPOFF`        | Problem at pick-up or drop-off     |
 * | `CARGO_DAMAGED_OR_MISSING` | Cargo damaged or missing           |
 * | `PAYMENT_OR_WITHDRAWAL`    | Payment or withdrawal              |
 * | `DOCUMENTS_AND_ACCOUNT`    | Documents and account              |
 * | `OTHER`                    | Something else                     |
 *
 * The **Orders → Report a problem** list, in the design's order
 * (`JOB_PROBLEM_TOPICS`). Two of its seven are topics the Support screen
 * already had:
 *
 * | Value                           | Design copy                      |
 * | ------------------------------- | -------------------------------- |
 * | `CONTACT_UNREACHABLE`           | Can't reach the contact          |
 * | `ADDRESS_WRONG_OR_INACCESSIBLE` | Address is wrong or inaccessible |
 * | `CARGO_MISMATCH`                | Cargo doesn't match the listing  |
 * | `CARGO_DAMAGED_OR_MISSING`      | Cargo damaged                    |
 * | `VEHICLE_BREAKDOWN`             | Vehicle breakdown                |
 * | `ACCIDENT`                      | Accident                         |
 * | `OTHER`                         | Something else                   |
 *
 * `SUPPORT_TOPICS` is every value, in the database enum's order — the original
 * five, then the five added for the report flow. The route accepts any of
 * them from either screen.
 */
export type SupportTopic =
  | "PICKUP_OR_DROPOFF"
  | "CARGO_DAMAGED_OR_MISSING"
  | "PAYMENT_OR_WITHDRAWAL"
  | "DOCUMENTS_AND_ACCOUNT"
  | "OTHER"
  | "CONTACT_UNREACHABLE"
  | "ADDRESS_WRONG_OR_INACCESSIBLE"
  | "CARGO_MISMATCH"
  | "VEHICLE_BREAKDOWN"
  | "ACCIDENT";

export const SUPPORT_TOPICS: readonly SupportTopic[] = [
  "PICKUP_OR_DROPOFF",
  "CARGO_DAMAGED_OR_MISSING",
  "PAYMENT_OR_WITHDRAWAL",
  "DOCUMENTS_AND_ACCOUNT",
  "OTHER",
  "CONTACT_UNREACHABLE",
  "ADDRESS_WRONG_OR_INACCESSIBLE",
  "CARGO_MISMATCH",
  "VEHICLE_BREAKDOWN",
  "ACCIDENT",
];

/** The Support screen's five, in the design's order. */
export const SUPPORT_SCREEN_TOPICS: readonly SupportTopic[] = [
  "PICKUP_OR_DROPOFF",
  "CARGO_DAMAGED_OR_MISSING",
  "PAYMENT_OR_WITHDRAWAL",
  "DOCUMENTS_AND_ACCOUNT",
  "OTHER",
];

/** The "Report a problem" flow's seven, in the design's order. */
export const JOB_PROBLEM_TOPICS: readonly SupportTopic[] = [
  "CONTACT_UNREACHABLE",
  "ADDRESS_WRONG_OR_INACCESSIBLE",
  "CARGO_MISMATCH",
  "CARGO_DAMAGED_OR_MISSING",
  "VEHICLE_BREAKDOWN",
  "ACCIDENT",
  "OTHER",
];

export type SupportMessageStatus = "OPEN" | "RESOLVED";

export const SUPPORT_MESSAGE_STATUSES: readonly SupportMessageStatus[] = [
  "OPEN",
  "RESOLVED",
];

/**
 * The longest "What happened?" accepted, in characters after trimming. Room
 * for a few paragraphs typed on a phone at a loading bay; not a case file.
 */
export const MAX_SUPPORT_MESSAGE_LENGTH = 2000;

/** How many of a driver's own messages `GET` returns, newest first. */
export const SUPPORT_MESSAGE_HISTORY_LIMIT = 20;

/**
 * How many messages one driver may send per window. Generous for a real
 * problem (a correction, a follow-up, a second job) and far below what a stuck
 * retry loop or a script would send.
 */
export const SUPPORT_MESSAGE_RATE_LIMIT = {
  limit: 5,
  windowMs: 10 * 60 * 1000,
} as const;

/**
 * The start of the window a message sent at `now` is counted in: the driver's
 * messages created **after** this instant are their "recent" ones.
 *
 * The limit is counted from the driver's own `SupportMessage` rows, not from a
 * counter in process memory. On a serverless deployment every instance has its
 * own memory and a cold start empties it, so an in-memory count bounds each
 * instance, not the driver; the rows are the one count every instance agrees
 * on, and the table's `[driverProfileId, createdAt]` index answers it.
 */
export function supportRateWindowStart(now: Date): Date {
  return new Date(now.getTime() - SUPPORT_MESSAGE_RATE_LIMIT.windowMs);
}

/**
 * Whether a driver who has already sent `recentCount` messages inside the
 * window must wait before sending another.
 */
export function isSupportRateLimited(recentCount: number): boolean {
  return recentCount >= SUPPORT_MESSAGE_RATE_LIMIT.limit;
}

/** Narrows an untrusted value to a `SupportTopic`. */
export function isSupportTopic(value: unknown): value is SupportTopic {
  return (
    typeof value === "string" && SUPPORT_TOPICS.includes(value as SupportTopic)
  );
}

/** Narrows an untrusted value to a `SupportMessageStatus`. */
export function isSupportMessageStatus(
  value: unknown,
): value is SupportMessageStatus {
  return (
    typeof value === "string" &&
    SUPPORT_MESSAGE_STATUSES.includes(value as SupportMessageStatus)
  );
}

/** Why a message body is not acceptable. */
export type SupportBodyRefusal = "BODY_REQUIRED" | "BODY_TOO_LONG";

/**
 * The body as it will be stored — trimmed — or why it is refused. Whitespace
 * alone is no message: the design's own Send answers "Add a short description
 * first."
 */
export function parseSupportBody(
  value: unknown,
): { body: string } | { refusal: SupportBodyRefusal } {
  if (typeof value !== "string" || value.trim() === "") {
    return { refusal: "BODY_REQUIRED" };
  }

  const body = value.trim();

  return body.length > MAX_SUPPORT_MESSAGE_LENGTH
    ? { refusal: "BODY_TOO_LONG" }
    : { body };
}
