import { NextResponse } from "next/server";

import type { AdminRole } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { auth } from "@/lib/auth";
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
 * as suspended, with the reason staff gave, and cut off the sessions it is
 * holding right now.
 *
 * Two writes, in this order, and the order matters. Setting `isSuspended`
 * first closes the front door: `src/lib/auth.ts` refuses to create a session
 * for a suspended account, so nothing can sign back in during the moment
 * between the two writes. Revoking afterwards then clears out whatever was
 * already inside.
 *
 * Revocation is not optional politeness. Without it a suspended driver stays
 * fully live until their token happens to expire — able to keep claiming loads
 * off the board — which is precisely the situation suspension exists to stop.
 *
 * Deliberately NOT done here: releasing an accepted-but-undelivered order back
 * to the load board. A suspended driver holding a live delivery is a real
 * operational problem, but reassigning a client's in-flight order is a
 * client-facing decision with its own notification and pricing consequences,
 * and it does not belong in the auth fix. Suspension currently locks the driver
 * out and leaves the order assigned to them for staff to move by hand.
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

  // Better Auth owns the `session` table, so the revocation goes through its
  // own internal adapter rather than a direct `prisma.session.deleteMany`.
  // `auth.$context` is the documented handle on the initialised server
  // instance, and `deleteUserSessions` is the call that also clears secondary
  // storage — which this deployment does not configure today, but a
  // hand-rolled Prisma delete would silently stop covering if it ever did.
  const authContext = await auth.$context;
  await authContext.internalAdapter.deleteUserSessions(userId);

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
