import { NextResponse } from "next/server";

import type { AdminRole, SupportMessageStatus } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/** See `../../route.ts` for why these three. */
const ALLOWED_ROLES: readonly AdminRole[] = [
  "SUPER_ADMIN",
  "SUPPORT",
  "USER_MANAGER",
];

/** Body this endpoint answers with, so the queue can update in place. */
export type AdminSupportMessageResolveResponse = {
  messageId: string;
  status: SupportMessageStatus;
  resolvedAt: string | null;
};

/**
 * POST /api/admin/support-messages/[id]/resolve — mark a message as dealt
 * with, recording who did and when.
 *
 * The write is conditional on the message still being `OPEN`, and its audit
 * row is written in the same transaction, so two staff members resolving the
 * same message produce exactly one resolution and one audit row;
 * the second is told it has already been resolved (409) rather than silently
 * overwriting the first one's name.
 *
 * Nothing is sent to the driver: there is no reply channel. The driver's own
 * list shows the status change the next time the app reads it.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const t = await getRequestTranslations();
  const { id } = await params;
  const { actorId } = authorized.context;
  const resolvedAt = new Date();

  // The resolution and its audit row are one transaction: neither exists
  // without the other. Written after the commit, a failed audit write would
  // answer 500 for a message that is already resolved, with no record of who
  // resolved it and no way to retry (the second attempt is a 409).
  const count = await prisma.$transaction(async (tx) => {
    const updated = await tx.supportMessage.updateMany({
      where: { id, status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt, resolvedById: actorId },
    });

    if (updated.count > 0) {
      await writeAuditLog(
        {
          actorId,
          action: "support_message.resolve",
          entityType: "SupportMessage",
          entityId: id,
        },
        tx,
      );
    }

    return updated.count;
  });

  if (count === 0) {
    const existing = await prisma.supportMessage.findUnique({
      where: { id },
      select: { id: true },
    });

    return existing
      ? NextResponse.json(
          { error: t("errors.adminSupportMessages.alreadyResolved") },
          { status: 409 },
        )
      : NextResponse.json(
          { error: t("errors.adminSupportMessages.messageNotFound") },
          { status: 404 },
        );
  }

  const body: AdminSupportMessageResolveResponse = {
    messageId: id,
    status: "RESOLVED",
    resolvedAt: resolvedAt.toISOString(),
  };

  return NextResponse.json(body, { status: 200 });
}
