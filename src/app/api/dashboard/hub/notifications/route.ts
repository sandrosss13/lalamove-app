import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import type { HubNotificationsResponse } from "@/lib/mobile-api/contracts";
import { hubApiOk, requireHubApiAccount } from "@/lib/mobile-api/hub-api-guard";
import {
  countUnread,
  invalidInboxRequest,
  type InboxRefusal,
} from "@/lib/notifications/inbox-api";
import {
  parseInboxCursor,
  parseInboxLimit,
  toHubDriverNotification,
  toInboxPage,
} from "@/lib/notifications/inbox-rules";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const INBOX_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  data: true,
  readAt: true,
  createdAt: true,
} as const;

/**
 * GET /api/dashboard/hub/notifications — the account's notification inbox,
 * newest first, a page at a time (`?limit=`, `?cursor=`), with the unread
 * count for the badge.
 *
 * Keyset-paged on `(createdAt, id)`, both descending, so an entry written
 * while the driver scrolls never shifts a page. The cursor is looked up among
 * the session user's own entries only: another account's id is refused like
 * an unknown one, and says nothing about whether it exists.
 *
 * A logistics company passes the guard and has no entries — nothing writes
 * one for a company account.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<HubNotificationsResponse | InboxRefusal>> {
  const t = await getRequestTranslations();

  const guard = await requireHubApiAccount(request, t);
  if (!guard.ok) {
    return guard.response;
  }

  const { userId } = guard.account;
  const { searchParams } = new URL(request.url);
  const limit = parseInboxLimit(searchParams.get("limit"));
  const cursorId = parseInboxCursor(searchParams.get("cursor"));

  let after: { id: string; createdAt: Date } | null = null;

  if (cursorId !== null) {
    after = await prisma.driverNotification.findFirst({
      where: { id: cursorId, userId },
      select: { id: true, createdAt: true },
    });

    if (after === null) {
      return invalidInboxRequest(t("errors.notificationInbox.cursorNotFound"));
    }
  }

  const [rows, unreadCount] = await Promise.all([
    prisma.driverNotification.findMany({
      where: {
        userId,
        ...(after === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: after.createdAt } },
                { createdAt: after.createdAt, id: { lt: after.id } },
              ],
            }),
      },
      select: INBOX_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // One more than the page, to know whether there is a next one.
      take: limit + 1,
    }),
    countUnread(userId),
  ]);

  const { page, nextCursor } = toInboxPage(rows, limit);

  return hubApiOk<HubNotificationsResponse>({
    notifications: page.map(toHubDriverNotification),
    nextCursor,
    unreadCount,
  });
}
