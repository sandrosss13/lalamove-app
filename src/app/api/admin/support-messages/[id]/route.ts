import { NextResponse } from "next/server";

import type {
  AdminRole,
  OrderStatus,
  SupportMessageStatus,
  SupportTopic,
} from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { driverDisplayName } from "@/lib/admin/driver-name";
import { prisma } from "@/lib/prisma";

/** See `../route.ts` for why these three. */
const ALLOWED_ROLES: readonly AdminRole[] = [
  "SUPER_ADMIN",
  "SUPPORT",
  "USER_MANAGER",
];

/** Body of `GET /api/admin/support-messages/[id]`. */
export type AdminSupportMessageDetail = {
  messageId: string;
  topic: SupportTopic;
  body: string;
  status: SupportMessageStatus;
  createdAt: string;
  resolvedAt: string | null;
  /** The staff member who resolved it; null if open, or their account is gone. */
  resolvedByName: string | null;
  driver: {
    name: string;
    /** The number to call — the only way to answer a message. */
    phone: string;
    /** The stored `GeorgianCity` value. */
    city: string;
    /** The employer, for a roster driver. */
    companyName: string | null;
  };
  /** The job the driver attached. Carrier-side facts only — no client money. */
  order: {
    id: string;
    reference: string;
    status: OrderStatus;
    pickupAddress: string;
    dropoffAddress: string;
  } | null;
};

/**
 * GET /api/admin/support-messages/[id] — one message in full, with the driver
 * to call and the job it is about.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const { id } = await params;

  const message = await prisma.supportMessage.findUnique({
    where: { id },
    select: {
      id: true,
      topic: true,
      body: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      resolvedBy: { select: { name: true } },
      driverProfile: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
          city: true,
          company: { select: { companyName: true } },
          user: { select: { name: true } },
        },
      },
      order: {
        select: {
          id: true,
          reference: true,
          status: true,
          pickupAddress: true,
          dropoffAddress: true,
        },
      },
    },
  });

  if (!message) {
    const t = await getRequestTranslations();
    return NextResponse.json(
      { error: t("errors.adminSupportMessages.messageNotFound") },
      { status: 404 },
    );
  }

  const body: AdminSupportMessageDetail = {
    messageId: message.id,
    topic: message.topic,
    body: message.body,
    status: message.status,
    createdAt: message.createdAt.toISOString(),
    resolvedAt: message.resolvedAt?.toISOString() ?? null,
    resolvedByName: message.resolvedBy?.name ?? null,
    driver: {
      name: driverDisplayName(message.driverProfile),
      phone: message.driverProfile.phone,
      city: message.driverProfile.city,
      companyName: message.driverProfile.company?.companyName ?? null,
    },
    order:
      message.order === null
        ? null
        : {
            id: message.order.id,
            reference: message.order.reference,
            status: message.order.status,
            pickupAddress: message.order.pickupAddress,
            dropoffAddress: message.order.dropoffAddress,
          },
  };

  return NextResponse.json(body, { status: 200 });
}
