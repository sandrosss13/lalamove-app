import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import type { HubNotificationsReadResponse } from "@/lib/mobile-api/contracts";
import { hubApiOk, requireHubApiAccount } from "@/lib/mobile-api/hub-api-guard";
import {
  countUnread,
  invalidInboxRequest,
  type InboxRefusal,
} from "@/lib/notifications/inbox-api";
import {
  MAX_MARK_READ_IDS,
  parseMarkReadBody,
} from "@/lib/notifications/inbox-rules";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/dashboard/hub/notifications/read — mark inbox entries read. Body:
 * `{ ids?: string[] }`; without ids (or with none), every unread entry.
 *
 * Scoped to the session user: the update's own `where` carries `userId`, so an
 * id of somebody else's entry matches nothing and is ignored rather than
 * refused — which would confirm it exists. An entry already read keeps the
 * time it was first read.
 *
 * Answers the unread count left, for the badge.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<HubNotificationsReadResponse | InboxRefusal>> {
  const t = await getRequestTranslations();

  const guard = await requireHubApiAccount(request, t);
  if (!guard.ok) {
    return guard.response;
  }

  // An empty body is "mark everything", the same as `{}`; anything else must
  // be JSON.
  const text = await request.text();
  let body: unknown;

  if (text.trim() !== "") {
    try {
      body = JSON.parse(text);
    } catch {
      return invalidInboxRequest(t("common.shared.requestBodyMustBeValidJson"));
    }
  }

  const parsed = parseMarkReadBody(body);

  if ("refusal" in parsed) {
    switch (parsed.refusal) {
      case "BODY_NOT_AN_OBJECT":
        return invalidInboxRequest(t("common.shared.requestBodyMustBeAJson"));
      case "IDS_NOT_A_LIST":
        return invalidInboxRequest(
          t("errors.notificationInbox.idsMustBeAListOfIds"),
        );
      case "TOO_MANY_IDS":
        return invalidInboxRequest(
          t("errors.notificationInbox.tooManyIds", { max: MAX_MARK_READ_IDS }),
        );
    }
  }

  const { userId } = guard.account;

  await prisma.driverNotification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(parsed.ids === "ALL" ? {} : { id: { in: parsed.ids } }),
    },
    data: { readAt: new Date() },
  });

  return hubApiOk<HubNotificationsReadResponse>({
    unreadCount: await countUnread(userId),
  });
}
