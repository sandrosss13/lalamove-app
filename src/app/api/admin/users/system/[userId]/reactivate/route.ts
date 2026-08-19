import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin/audit";
import { hasAdminRole } from "@/lib/admin/roles";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/users/system/[userId]/reactivate — restore a previously
 * deactivated staff member's back-office access.
 *
 * The mirror of the deactivate route, kept as its own endpoint rather than a
 * shared `PATCH { isActive }` so each direction has its own audit action and
 * its own authorization surface. `SUPER_ADMIN`-only for the same reason:
 * restoring access is as privileged as granting it in the first place.
 *
 * `userId` is the `User.id`, not the `SystemUserProfile.id`.
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

  if (!hasAdminRole(actorProfile, ["SUPER_ADMIN"])) {
    return NextResponse.json(
      { error: "Only a super admin can reactivate system users." },
      { status: 403 },
    );
  }

  const { userId } = await params;

  // Unreachable in practice — a super admin whose own profile is inactive never
  // gets past the check above — but rejected explicitly so this route can never
  // become a way to restore one's own access, whatever the guard above becomes
  // later.
  if (userId === session.user.id) {
    return NextResponse.json(
      { error: "You cannot change your own account's status." },
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
    data: { isActive: true },
  });

  await writeAuditLog({
    actorId: session.user.id,
    action: "system_user.reactivate",
    entityType: "SystemUserProfile",
    entityId: target.id,
    // `wasActive` distinguishes a real restoration from a repeated click, which
    // the resulting row would otherwise look identical to.
    metadata: { userId, wasActive: target.isActive },
  });

  return NextResponse.json({ userId, isActive: true });
}
