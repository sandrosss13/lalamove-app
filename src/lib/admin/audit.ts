// Writes to the database through Prisma, so it can never be part of a browser
// bundle. Fails the build loudly if a client component ever imports it.
import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type AuditLogInput = {
  /** `User.id` of the staff member performing the action. */
  actorId: string;
  /**
   * Dotted `<entity>.<verb>` string, e.g. `"banner.create"`,
   * `"system_user.deactivate"`. Free-form by design (see the `AuditLog` model
   * doc) — keeping the convention is this helper's job, not the schema's.
   */
  action: string;
  /** The kind of thing acted on, e.g. `"Banner"`, `"SystemUserProfile"`. */
  entityType: string;
  /** The specific row's id, when the action targets one (creates may not). */
  entityId?: string;
  /**
   * Whatever the action needs for a later human to reconstruct it — old/new
   * values, related ids. Debugging and compliance trail only; nothing queries
   * inside it.
   */
  metadata?: Prisma.InputJsonValue;
};

/**
 * Writes one audit-log row.
 *
 * A wrapper this thin exists purely so every admin section records actions the
 * same way: one import and one call shape instead of each feature hand-rolling
 * `prisma.auditLog.create` and inventing its own field conventions.
 *
 * Deliberately *not* wrapped in a try/catch: an audit write that fails should
 * fail its caller loudly rather than let a privileged mutation land with no
 * trace of who made it.
 */
export async function writeAuditLog({
  actorId,
  action,
  entityType,
  entityId,
  metadata,
}: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId,
      metadata,
    },
  });
}
