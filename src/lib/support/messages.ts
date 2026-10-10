/**
 * Reading a driver's support messages out of the database, as plain data.
 *
 * Server-only (Prisma). The rules — topics, limits — are `./rules`'s.
 */
import "server-only";

import type { Prisma } from "@prisma/client";

import type { SupportMessageStatus, SupportTopic } from "@/lib/support/rules";

/**
 * The columns a driver is shown of their own message. `resolvedById` is absent
 * on purpose: who dealt with it is staff-side information.
 */
export const SUPPORT_MESSAGE_SELECT = {
  id: true,
  topic: true,
  body: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  order: { select: { id: true, reference: true } },
} satisfies Prisma.SupportMessageSelect;

type SupportMessageRow = Prisma.SupportMessageGetPayload<{
  select: typeof SUPPORT_MESSAGE_SELECT;
}>;

/** One message, serialisable: every timestamp an ISO string. */
export type SupportMessageRecord = {
  id: string;
  topic: SupportTopic;
  body: string;
  status: SupportMessageStatus;
  /** Null when none was attached, or the order has since been deleted. */
  order: { id: string; reference: string } | null;
  createdAt: string;
  resolvedAt: string | null;
};

export function toSupportMessageRecord(
  row: SupportMessageRow,
): SupportMessageRecord {
  return {
    id: row.id,
    topic: row.topic,
    body: row.body,
    status: row.status,
    order:
      row.order === null
        ? null
        : { id: row.order.id, reference: row.order.reference },
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}
