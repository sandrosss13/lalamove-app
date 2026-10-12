// Shared by the notification-inbox route handlers; server code only.
import "server-only";

import { NextResponse } from "next/server";

import type {
  HubApiErrorResponse,
  HubNotificationsErrorResponse,
} from "@/lib/mobile-api/contracts";
import { prisma } from "@/lib/prisma";

/** Anything an inbox route answers a refusal with. */
export type InboxRefusal = HubNotificationsErrorResponse | HubApiErrorResponse;

/** A 400 `INVALID_REQUEST` in the inbox's error shape. Never cached. */
export function invalidInboxRequest(
  message: string,
): NextResponse<HubNotificationsErrorResponse> {
  return NextResponse.json<HubNotificationsErrorResponse>(
    { error: message, code: "INVALID_REQUEST" },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

/** How many of the account's entries are unread — the app's badge. */
export function countUnread(userId: string): Promise<number> {
  return prisma.driverNotification.count({
    where: { userId, readAt: null },
  });
}
