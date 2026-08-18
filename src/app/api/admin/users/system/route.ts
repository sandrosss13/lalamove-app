import { randomBytes } from "node:crypto";

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { AdminRole, UserRole } from "@prisma/client";
import { APIError } from "better-auth/api";

import { writeAuditLog } from "@/lib/admin/audit";
import { hasAdminRole } from "@/lib/admin/roles";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * The internal staff accounts that can sign into `/admin` itself.
 *
 * There is deliberately no self-serve sign-up for admin accounts — the public
 * `POST /api/auth/sign-up/email` endpoint rejects `role: "ADMIN"` outright (see
 * the `before` hook in `@/lib/auth`) — so this endpoint is the only way a new
 * back-office account comes into existence.
 *
 * Listing is open to `USER_MANAGER` as well, because seeing who has back-office
 * access is part of managing users. Creating one is `SUPER_ADMIN`-only: letting
 * a delegated role mint accounts would let a `USER_MANAGER` hand itself
 * `SUPER_ADMIN` and escape its own boundary.
 */

/** Valid `AdminRole` values, derived from the generated Prisma enum. */
const ADMIN_ROLES = Object.values(AdminRole);

/**
 * Bytes of entropy behind the temporary password. 12 random bytes is ~96 bits,
 * far beyond what a credential valid until first sign-in needs, and
 * `base64url`-encodes to 16 characters — comfortably over Better Auth's minimum
 * password length while remaining short enough to relay by hand.
 */
const TEMP_PASSWORD_BYTES = 12;

/** Validated shape of a create-system-user request body. */
type CreateSystemUserInput = {
  name: string;
  email: string;
  adminRole: AdminRole;
};

/**
 * Session + back-office authorization for this route family, written inline
 * rather than shared from `@/lib/admin` because `requireSystemUser()` is built
 * for pages: it `redirect()`s on failure, which is meaningless to a `fetch`
 * caller that needs a status code.
 *
 * Returns the caller's `User.id` (needed as the audit-log actor) on success, or
 * the exact response to send on failure. The three rejections are deliberately
 * ordered cheapest-first: the session's `role` is checked before any query, so
 * a stray request from a signed-in client costs nothing.
 *
 * A missing or deactivated profile is a 401 rather than a 403 for the same
 * reason `requireSystemUser` sends every failure to the same place: the back
 * office never confirms that an account exists or once had access. A wrong
 * `adminRole` is a genuine 403 — the caller *is* staff, just not enough of it.
 */
async function authorizeSystemUserApi(
  allowed: readonly AdminRole[],
): Promise<{ actorId: string } | { response: NextResponse }> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || session.user.role !== "ADMIN") {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  // Re-read per request rather than trusting the session: deactivation has to
  // take effect on the very next call, not when the token expires.
  const profile = await prisma.systemUserProfile.findUnique({
    where: { userId: session.user.id },
    select: { adminRole: true, isActive: true },
  });

  if (!profile || !profile.isActive) {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  if (!hasAdminRole(profile, allowed)) {
    return {
      response: NextResponse.json(
        { error: "You do not have access to this action." },
        { status: 403 },
      ),
    };
  }

  return { actorId: session.user.id };
}

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * No password is accepted: one is generated server-side and returned once, so
 * there is no path by which a weak or reused admin credential gets chosen by
 * the person creating the account.
 */
function parseCreateSystemUserBody(
  body: unknown,
): { data: CreateSystemUserInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  const { name } = record;
  if (typeof name !== "string" || name.trim() === "") {
    return { error: "name is required and must be a non-empty string." };
  }

  const { email } = record;
  if (typeof email !== "string" || email.trim() === "") {
    return { error: "email is required and must be a non-empty string." };
  }

  const { adminRole } = record;
  if (
    typeof adminRole !== "string" ||
    !ADMIN_ROLES.includes(adminRole as AdminRole)
  ) {
    return { error: `adminRole must be one of: ${ADMIN_ROLES.join(", ")}.` };
  }

  return {
    data: {
      name: name.trim(),
      email: email.trim(),
      adminRole: adminRole as AdminRole,
    },
  };
}

/**
 * GET /api/admin/users/system — every back-office account, active and
 * deactivated alike, newest first. Deactivated rows are included on purpose:
 * the list is also the reactivation surface.
 */
export async function GET(): Promise<NextResponse> {
  const authorized = await authorizeSystemUserApi([
    "SUPER_ADMIN",
    "USER_MANAGER",
  ]);
  if ("response" in authorized) {
    return authorized.response;
  }

  const systemUsers = await prisma.systemUserProfile.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      adminRole: true,
      isActive: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({ systemUsers });
}

/**
 * POST /api/admin/users/system — create a staff account with a temporary
 * password, returned once so the creating admin can relay it out of band (no
 * email provider is wired up, and the password is never readable again).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const authorized = await authorizeSystemUserApi(["SUPER_ADMIN"]);
  if ("response" in authorized) {
    return authorized.response;
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseCreateSystemUserBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { name, email, adminRole } = parsed.data;

  // Checked up front so a taken address produces a specific message instead of
  // whatever `signUpEmail` happens to throw. Case-insensitive because the admin
  // types the address the way the new staff member wrote it to them; `email` is
  // unique, so at most one row can match either way.
  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "An account with that email address already exists." },
      { status: 400 },
    );
  }

  const tempPassword = randomBytes(TEMP_PASSWORD_BYTES).toString("base64url");

  // The account goes through Better Auth's own sign-up logic rather than a raw
  // Prisma insert, so the password is hashed with the same algorithm the
  // sign-in path verifies against — a hand-rolled `Account` row would not
  // actually let the new admin log in. This mirrors the company-driven driver
  // registration route, including the two things it does *not* do:
  //
  // - The incoming request's headers are deliberately not forwarded. Doing so
  //   would make Better Auth issue a session for the new account and set its
  //   cookie on this response, silently signing the creating admin out of their
  //   own account.
  // - `role` is sent as CLIENT, not ADMIN, and promoted to ADMIN immediately
  //   below. The sign-up hook in `@/lib/auth` rejects `role: "ADMIN"`
  //   unconditionally — before its `ctx.request` bail-out — so even this
  //   server-to-server call cannot ask for it directly, and that file is
  //   finalized and out of scope here. The window in which the row is a CLIENT
  //   is one statement long, no session has been issued for it, and the failure
  //   path below deletes the account outright, so it is never reachable as a
  //   usable client login.
  let createdUserId: string;
  try {
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email,
        name,
        password: tempPassword,
        role: UserRole.CLIENT,
      },
    });
    createdUserId = signUpResult.user.id;
  } catch (error) {
    // Better Auth rejects with its own message for cases this handler doesn't
    // pre-check (a password policy, a race on the email uniqueness check);
    // surfacing that verbatim is more useful than a generic failure. Anything
    // that is not an `APIError` is a genuine fault and is rethrown.
    if (error instanceof APIError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode ?? 400 },
      );
    }

    throw error;
  }

  // One transaction so the account is never left half-promoted: either it is an
  // ADMIN with a back-office profile and a forced password change, or (via the
  // cleanup below) it does not exist at all.
  let systemUserProfileId: string;
  try {
    systemUserProfileId = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: createdUserId },
        data: {
          role: UserRole.ADMIN,
          // Reuses the existing forced-password-change flow the driver
          // registration relies on: the app layer sends the user to
          // `/change-password` while this is true, and Better Auth's `after`
          // hook clears it once they actually pick a password.
          mustChangePassword: true,
        },
      });

      const profile = await tx.systemUserProfile.create({
        data: { userId: createdUserId, adminRole, isActive: true },
        select: { id: true },
      });

      return profile.id;
    });
  } catch (error) {
    // `auth.api.signUpEmail` runs its own writes and cannot join the
    // transaction above, so the `User`/`Account` rows already exist and would
    // otherwise be left orphaned — with a live credential and no back-office
    // profile. Best-effort cleanup deletes them (`Account`/`Session` cascade
    // off `User`), which also frees the email address so the admin can simply
    // retry. If even the cleanup fails there is nothing left to try
    // automatically, so both faults are logged for a human.
    console.error("System user profile creation failed:", error);

    try {
      await prisma.user.delete({ where: { id: createdUserId } });
    } catch (cleanupError) {
      console.error(
        `Failed to clean up orphaned user ${createdUserId} after a failed system user creation:`,
        cleanupError,
      );
    }

    return NextResponse.json(
      { error: "Could not create this system user. Please try again." },
      { status: 500 },
    );
  }

  await writeAuditLog({
    actorId: authorized.actorId,
    action: "system_user.create",
    entityType: "SystemUserProfile",
    entityId: systemUserProfileId,
    // The temporary password is never recorded — the audit trail says who was
    // granted what, not how they first signed in.
    metadata: { userId: createdUserId, name, email, adminRole },
  });

  // `temporaryPassword` is returned exactly once, here. It is never persisted
  // in readable form and must not be logged by callers.
  return NextResponse.json(
    {
      user: {
        id: createdUserId,
        systemUserProfileId,
        name,
        email,
        adminRole,
      },
      temporaryPassword: tempPassword,
    },
    { status: 201 },
  );
}
