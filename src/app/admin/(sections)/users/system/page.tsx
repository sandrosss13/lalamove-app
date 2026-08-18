import { redirect } from "next/navigation";

import {
  ADMIN_ROLE_LABELS,
  CreateSystemUserDialog,
} from "@/components/admin/users/create-system-user-dialog";
import { SystemUserStatusButton } from "@/components/admin/users/system-user-status-button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasAdminRole, requireSystemUser } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * UTC so the "created" column matches the timestamps every other admin surface
 * reports, and so the server render and the client render agree regardless of
 * where either one runs.
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The internal staff accounts that can sign into `/admin` itself — the one place
 * a back-office account is ever created, since there is deliberately no
 * self-serve admin sign-up (`@/lib/auth` rejects `role: "ADMIN"` at the public
 * sign-up endpoint).
 *
 * Two different gates, on purpose:
 *
 * - *Viewing* is open to `USER_MANAGER` too. Knowing who holds back-office
 *   access is part of managing users, and the list leaks nothing a user manager
 *   cannot already see elsewhere. (The sidebar still only offers the tab to a
 *   `SUPER_ADMIN`; a user manager reaching it by URL gets the read-only view.)
 * - *Creating and deactivating* is `SUPER_ADMIN`-only. Anything less would let a
 *   delegated role mint itself a `SUPER_ADMIN`, or lock the real ones out.
 *
 * Both gates are re-checked by the API routes behind them, which is where the
 * real boundary lives — hiding a button does nothing about a hand-rolled
 * request.
 */
export default async function SystemUsersPage() {
  const { systemUserProfile } = await requireSystemUser();

  // The section layout above admits SUPPORT as well, which is narrower here.
  // `/admin` forwards to the first section the role can open, so this cannot
  // ping-pong.
  if (!hasAdminRole(systemUserProfile, ["SUPER_ADMIN", "USER_MANAGER"])) {
    redirect("/admin");
  }

  const canManage = hasAdminRole(systemUserProfile, ["SUPER_ADMIN"]);

  // Read directly rather than through `GET /api/admin/users/system`: this is a
  // server component with the same database access the route has, and going
  // over HTTP would only add a round trip and a second session check. The route
  // exists for client callers.
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Staff accounts with access to this back office. New accounts are
          created with a temporary password that is shown once.
        </p>
        {canManage ? <CreateSystemUserDialog /> : null}
      </div>

      <div className="rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              {canManage ? (
                <TableHead className="text-right">Actions</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {systemUsers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 6 : 5}
                  className="text-muted-foreground"
                >
                  No system users yet.
                </TableCell>
              </TableRow>
            ) : (
              systemUsers.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">
                    {entry.user.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.user.email}
                  </TableCell>
                  <TableCell>{ADMIN_ROLE_LABELS[entry.adminRole]}</TableCell>
                  <TableCell>
                    <Badge variant={entry.isActive ? "secondary" : "outline"}>
                      {entry.isActive ? "Active" : "Deactivated"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(entry.createdAt)}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      {/* The signed-in admin gets no toggle for their own row:
                          the route rejects self-deactivation outright, since
                          this spec has no way back from locking yourself out. */}
                      {entry.userId === systemUserProfile.userId ? (
                        <span className="text-xs text-muted-foreground">
                          You
                        </span>
                      ) : (
                        <SystemUserStatusButton
                          userId={entry.userId}
                          name={entry.user.name}
                          isActive={entry.isActive}
                        />
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
