import { NextResponse } from "next/server";

import type { AdminRole } from "@prisma/client";

// Type-only import of the sibling endpoint's response shape: suspend and
// unsuspend answer with the same object so the admin table can apply either
// outcome the same way, and sharing the type is what keeps that true.
import type { AdminSuspensionResponse } from "@/app/api/admin/users/[userId]/suspend/route";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may lift a suspension. Stated per route rather than imported from
 * one shared constant so the gate on each endpoint can be read — and audited —
 * without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "USER_MANAGER"];

/**
 * POST /api/admin/users/[userId]/unsuspend — lift a suspension, clearing the
 * flag and the context that came with it.
 *
 * Takes no body: the reason for *lifting* a suspension is not stored on `User`
 * (there is no column for it) — the audit trail is where that history lives,
 * and the reason being cleared is recorded there as `previousReason`.
 *
 * Unlike its suspend counterpart this does not refuse `ADMIN` targets. That
 * guard exists there to stop the moderation route being used as a back door to
 * disable staff; lifting a suspension only ever *restores* access, so refusing
 * it could only strand an account someone suspended by another path.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const { userId } = await params;

  // Read before write so a missing account is a clean 404 instead of a Prisma
  // "record not found" exception, and so the reason being cleared survives into
  // the audit entry.
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, suspendedReason: true },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      isSuspended: false,
      suspendedAt: null,
      suspendedReason: null,
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
    action: "user.unsuspend",
    entityType: "User",
    entityId: userId,
    // `null` is not a valid `InputJsonValue`, so an account with no recorded
    // reason simply omits the key rather than storing a null.
    metadata:
      target.suspendedReason === null
        ? {}
        : { previousReason: target.suspendedReason },
  });

  const body: AdminSuspensionResponse = {
    userId: updated.id,
    isSuspended: updated.isSuspended,
    suspendedAt: updated.suspendedAt?.toISOString() ?? null,
    suspendedReason: updated.suspendedReason,
  };

  return NextResponse.json(body, { status: 200 });
}
