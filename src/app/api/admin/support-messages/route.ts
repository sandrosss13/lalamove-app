import { NextResponse } from "next/server";

import type {
  AdminRole,
  Prisma,
  SupportMessageStatus,
  SupportTopic,
} from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { driverDisplayName } from "@/lib/admin/driver-name";
import { prisma } from "@/lib/prisma";
import { isSupportMessageStatus } from "@/lib/support/rules";

/**
 * Staff who may read and resolve drivers' support messages: the role that
 * exists for exactly this (`SUPPORT`), and the role that manages driver
 * accounts and already reads everything a message can mention. Stated per
 * route rather than imported, so each endpoint's gate can be read on its own.
 */
const ALLOWED_ROLES: readonly AdminRole[] = [
  "SUPER_ADMIN",
  "SUPPORT",
  "USER_MANAGER",
];

/** Rows per page. Matches the other admin listings so every table pages alike. */
const PAGE_SIZE = 25;

/** How much of the body a table row carries; the detail has all of it. */
const BODY_PREVIEW_LENGTH = 140;

/** One support message as the queue's table renders it. */
export type AdminSupportMessageRow = {
  messageId: string;
  topic: SupportTopic;
  /** The first `BODY_PREVIEW_LENGTH` characters. */
  bodyPreview: string;
  status: SupportMessageStatus;
  createdAt: string;
  resolvedAt: string | null;
  driver: { name: string; phone: string };
  /** The job the driver attached, when there is one. */
  order: { id: string; reference: string } | null;
};

/** Body of `GET /api/admin/support-messages`. */
export type AdminSupportMessageListResponse = {
  items: AdminSupportMessageRow[];
  page: number;
  pageSize: number;
  total: number;
  /** Always at least 1, so an empty list still renders as "Page 1 of 1". */
  pageCount: number;
  /** Open messages across every page and filter — the queue's backlog. */
  openCount: number;
};

/** `?page=` → a 1-based page number; anything unusable is the first page. */
function parsePage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * GET /api/admin/support-messages?status=&page= — the paginated queue behind
 * `/admin/support/messages`, newest first. `status` is `OPEN` or `RESOLVED`;
 * absent or unrecognised means both.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const url = new URL(request.url);
  const page = parsePage(url.searchParams.get("page"));
  const rawStatus = url.searchParams.get("status");
  const statusFilter = isSupportMessageStatus(rawStatus) ? rawStatus : null;

  const where: Prisma.SupportMessageWhereInput = statusFilter
    ? { status: statusFilter }
    : {};

  const [total, openCount, messages] = await Promise.all([
    prisma.supportMessage.count({ where }),
    prisma.supportMessage.count({ where: { status: "OPEN" } }),
    prisma.supportMessage.findMany({
      where,
      select: {
        id: true,
        topic: true,
        body: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        order: { select: { id: true, reference: true } },
        driverProfile: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            user: { select: { name: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const items: AdminSupportMessageRow[] = messages.map((message) => ({
    messageId: message.id,
    topic: message.topic,
    bodyPreview:
      message.body.length > BODY_PREVIEW_LENGTH
        ? `${message.body.slice(0, BODY_PREVIEW_LENGTH)}…`
        : message.body,
    status: message.status,
    createdAt: message.createdAt.toISOString(),
    resolvedAt: message.resolvedAt?.toISOString() ?? null,
    driver: {
      name: driverDisplayName(message.driverProfile),
      phone: message.driverProfile.phone,
    },
    order:
      message.order === null
        ? null
        : { id: message.order.id, reference: message.order.reference },
  }));

  const body: AdminSupportMessageListResponse = {
    items,
    page,
    pageSize: PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    openCount,
  };

  return NextResponse.json(body, { status: 200 });
}
