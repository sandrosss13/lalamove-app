import { NextResponse } from "next/server";

import type { AdminRole } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may suspend a customer or seller account. Stated per route rather
 * than imported from one shared constant so the gate on each endpoint can be
 * read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "USER_MANAGER"];

/**
 * Cap on the stored reason. Long enough for the context of a moderation
 * decision, short enough that the column stays a note rather than a case file.
 */
const MAX_REASON_LENGTH = 500;

/** Body both moderation endpoints answer with, so the UI can update in place. */
export type AdminSuspensionResponse = {
  userId: string;
  isSuspended: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
};

/**
 * POST /api/admin/users/[userId]/suspend — flag a customer or seller account
 * as suspended, with the reason staff gave.
 *
 * Storing the flag is all this does. Turning it into an actual block at
 * sign-in/session level is deliberately not wired up here (see the task notes):
 * that belongs in the shared auth configuration, which this task must not
 * touch, so until then `isSuspended` is a moderation record the back office
 * surfaces, not an enforced lockout.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const { userId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof rawBody !== "object" || rawBody === null) {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const { reason } = rawBody as Record<string, unknown>;

  if (typeof reason !== "string" || reason.trim() === "") {
    return NextResponse.json(
      { error: "A reason is required to suspend an account." },
      { status: 400 },
    );
  }

  const trimmedReason = reason.trim();

  if (trimmedReason.length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { error: `A reason must be ${MAX_REASON_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  // Read before write so a missing account is a clean 404 instead of a Prisma
  // "record not found" exception, and so the target's role can be checked.
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Internal staff are out of this endpoint's reach on purpose. Admin accounts
  // are revoked by deactivating their `SystemUserProfile` under System Users,
  // which is `SUPER_ADMIN`-only — letting a `USER_MANAGER` disable a colleague
  // (or a `SUPER_ADMIN`) through the customer-moderation route would route
  // around that restriction.
  if (target.role === "ADMIN") {
    return NextResponse.json(
      { error: "Staff accounts are managed under System Users." },
      { status: 403 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      isSuspended: true,
      suspendedAt: new Date(),
      suspendedReason: trimmedReason,
    },
    select: {
      id: true,
      isSuspended: true,
      suspendedAt: true,
      suspendedReason: true,
    },
  });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "user.suspend",
    entityType: "User",
    entityId: userId,
    metadata: { reason: trimmedReason },
  });

  const body: AdminSuspensionResponse = {
    userId: updated.id,
    isSuspended: updated.isSuspended,
    suspendedAt: updated.suspendedAt?.toISOString() ?? null,
    suspendedReason: updated.suspendedReason,
  };

  return NextResponse.json(body, { status: 200 });
}
