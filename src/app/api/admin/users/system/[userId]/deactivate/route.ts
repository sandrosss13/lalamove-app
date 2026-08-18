import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin/audit";
import { hasAdminRole } from "@/lib/admin/roles";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/users/system/[userId]/deactivate — revoke a staff member's
 * back-office access.
 *
 * `isActive` is flipped rather than the `User` deleted: the account keeps its
 * audit-log history and can be restored by the matching reactivate route.
 * `requireSystemUser()` re-reads the profile on every request, so access is cut
 * off on the target's very next page load rather than when their session
 * expires.
 *
 * `SUPER_ADMIN`-only, and separate from the reactivate route rather than a
 * single `PATCH { isActive }` endpoint, so the two directions get their own
 * audit action and their own authorization surface.
 *
 * `userId` is the `User.id`, not the `SystemUserProfile.id` — the profile is
 * unique on it, and every other admin surface identifies a person by their user
 * id.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  // Inline rather than shared: `requireSystemUser()` is built for pages and
  // `redirect()`s on failure, which is meaningless to a `fetch` caller. Role is
  // checked off the session before any query so a stray request from a
  // signed-in client costs nothing.
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const actorProfile = await prisma.systemUserProfile.findUnique({
    where: { userId: session.user.id },
    select: { adminRole: true, isActive: true },
  });

  if (!actorProfile || !actorProfile.isActive) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Deliberately narrower than the list endpoint: a USER_MANAGER can see who
  // has back-office access but cannot revoke it, since being able to deactivate
  // other admins is one half of taking the back office over.
  if (!hasAdminRole(actorProfile, ["SUPER_ADMIN"])) {
    return NextResponse.json(
      { error: "Only a super admin can deactivate system users." },
      { status: 403 },
    );
  }

  const { userId } = await params;

  // Rejected rather than silently ignored: this spec has no recovery path for a
  // super admin who revokes their own access — nobody else can restore it, and
  // there is no self-serve admin sign-up to start over from.
  if (userId === session.user.id) {
    return NextResponse.json(
      { error: "You cannot deactivate your own account." },
      { status: 400 },
    );
  }

  const target = await prisma.systemUserProfile.findUnique({
    where: { userId },
    select: { id: true, isActive: true },
  });

  if (!target) {
    return NextResponse.json(
      { error: "That system user was not found." },
      { status: 404 },
    );
  }

  await prisma.systemUserProfile.update({
    where: { userId },
    data: { isActive: false },
  });

  await writeAuditLog({
    actorId: session.user.id,
    action: "system_user.deactivate",
    entityType: "SystemUserProfile",
    entityId: target.id,
    // `wasActive` distinguishes a real revocation from a repeated click, which
    // the resulting row would otherwise look identical to.
    metadata: { userId, wasActive: target.isActive },
  });

  return NextResponse.json({ userId, isActive: false });
}
