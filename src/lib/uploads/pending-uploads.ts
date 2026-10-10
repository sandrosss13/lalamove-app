// Reads and writes `PendingUpload` through Prisma; server code only.
import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  pendingUploadDecision,
  pendingUploadExpiresAt,
} from "@/lib/uploads/rules";

/*
 * The database half of the upload-URL bound — see `./rules.ts` for what is
 * bounded and why, and the `PendingUpload` model for the row's life.
 *
 * Every function that decides something runs inside the caller's transaction,
 * *after* the caller has taken the row lock of the order or vehicle the upload
 * belongs to (`SELECT … FOR UPDATE`). That one lock is what makes the three
 * operations exclusive of each other:
 *
 *   - two issues for one order cannot both count "one below the cap";
 *   - a registration and a sweep cannot both act on the same row: the sweep
 *     removes only rows that have expired, a registration claims only rows that
 *     have not, and they run in turn.
 *
 * The second point is why a registration **requires** its row. If a missing row
 * were tolerated, a sweep that had just deleted the row (and is about to delete
 * the object) would be indistinguishable from "this path never had one", and a
 * photo row could be written pointing at an object being removed.
 */

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

/** What a pending upload belongs to — which also names its bucket. */
export type PendingUploadScope = { orderId: string } | { vehicleId: string };

export type ReservePendingUploadOutcome = {
  /**
   * Object paths whose URL has expired and whose row this call deleted. The
   * caller removes them from Storage **after its transaction commits** — an
   * upload that was made and then abandoned is reclaimed here.
   */
  expiredPaths: string[];
} & ({ reserved: true } | { reserved: false; retryAfterSeconds: number });

/**
 * Sweeps the scope's expired rows, then records a new pending upload for
 * `storagePath` unless the scope already has `cap` outstanding.
 *
 * Call inside a transaction, after locking the scope's row. The signed URL is
 * issued *after* the transaction commits; if that fails the caller releases the
 * row with `releasePendingUpload`. A process that dies in between leaves a row
 * holding a slot until it expires, which is the safe direction to fail in.
 */
export async function reservePendingUpload(
  tx: Tx,
  scope: PendingUploadScope,
  storagePath: string,
  cap: number,
  now: Date,
): Promise<ReservePendingUploadOutcome> {
  const rows = await tx.pendingUpload.findMany({
    where: scope,
    select: { id: true, storagePath: true, expiresAt: true },
  });

  const expired = rows.filter((row) => row.expiresAt <= now);
  const live = rows.filter((row) => row.expiresAt > now);

  if (expired.length > 0) {
    await tx.pendingUpload.deleteMany({
      where: { id: { in: expired.map((row) => row.id) } },
    });
  }

  const expiredPaths = expired.map((row) => row.storagePath);

  const decision = pendingUploadDecision({
    liveExpiries: live.map((row) => row.expiresAt),
    cap,
    now,
  });

  if (!decision.allowed) {
    return {
      expiredPaths,
      reserved: false,
      retryAfterSeconds: decision.retryAfterSeconds,
    };
  }

  await tx.pendingUpload.create({
    data: { ...scope, storagePath, expiresAt: pendingUploadExpiresAt(now) },
  });

  return { expiredPaths, reserved: true };
}

/**
 * Claims the pending upload for `storagePath` on behalf of a registration:
 * deletes its row and reports whether there was a live one to delete.
 *
 * `false` means the path may not be registered — it was never issued by this
 * server for this scope, its URL has expired, or it has been swept. Call inside
 * the registration's transaction, after locking the scope's row and *after* the
 * idempotency check (a path already registered has, correctly, no row left).
 */
export async function claimPendingUpload(
  tx: Tx,
  scope: PendingUploadScope,
  storagePath: string,
  now: Date,
): Promise<boolean> {
  const { count } = await tx.pendingUpload.deleteMany({
    where: { ...scope, storagePath, expiresAt: { gt: now } },
  });

  return count > 0;
}

/**
 * Frees the slot of an upload that will never be registered — the signed URL
 * could not be issued, or the object was refused and discarded. **Never
 * throws**: it runs after the request's real answer is decided, and a row left
 * behind only holds its slot until it expires.
 */
export async function releasePendingUpload(
  storagePath: string,
  db: Db = prisma,
): Promise<void> {
  try {
    await db.pendingUpload.deleteMany({ where: { storagePath } });
  } catch (error) {
    console.error("Failed to release a pending upload:", error);
  }
}
