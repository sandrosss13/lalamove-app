/**
 * Reads an order's proof of delivery and turns its stored object paths into
 * the short-lived signed URLs a reader is shown. Server-only: it signs with the
 * service role key.
 *
 * Authorisation is **not** decided here. Every caller has already established
 * that the reader may see this order — the POD routes by `resolvePodContext`,
 * the job sheet by `canViewJobSheet` — and hands in rows it selected itself.
 */
import "server-only";

import type { Prisma } from "@prisma/client";

import { getPodSignedUrls } from "@/lib/pod-storage";

/**
 * The columns a proof read needs, as a fragment to spread into an `Order`
 * select. Oldest photo first, so thumbnails keep the order they were taken in.
 */
export const ORDER_PROOF_SELECT = {
  podSignaturePath: true,
  podPhotos: {
    select: { id: true, storagePath: true, takenAt: true },
    orderBy: { createdAt: "asc" },
  },
} as const satisfies Prisma.OrderSelect;

/** What `ORDER_PROOF_SELECT` yields. */
export type OrderProofRows = {
  podSignaturePath: string | null;
  podPhotos: { id: string; storagePath: string; takenAt: Date }[];
};

/**
 * An order's proof as a reader receives it. Plain serialisable data — no
 * `Date`, and **no storage path**: a path is a permanent handle to a private
 * object, and the only thing a reader needs is a URL that expires.
 */
export type OrderProof = {
  photos: { id: string; url: string | null; takenAt: string }[];
  /**
   * Whether a signature is on file — stated separately from `signatureUrl`,
   * which is also null when Storage could not sign it.
   */
  hasSignature: boolean;
  signatureUrl: string | null;
};

/**
 * Signs every object in `rows` in one Storage round trip.
 *
 * A signing failure degrades to null URLs rather than throwing: the proof
 * *exists* (which is what gates completion and what a job sheet must report),
 * and failing a whole job sheet over a thumbnail would be the wrong trade.
 */
export async function toOrderProof(rows: OrderProofRows): Promise<OrderProof> {
  const paths = rows.podPhotos.map((photo) => photo.storagePath);
  if (rows.podSignaturePath !== null) {
    paths.push(rows.podSignaturePath);
  }

  let signed: Record<string, string> = {};
  try {
    signed = await getPodSignedUrls(paths);
  } catch (error) {
    console.error("Failed to sign proof-of-delivery URLs:", error);
  }

  return {
    photos: rows.podPhotos.map((photo) => ({
      id: photo.id,
      url: signed[photo.storagePath] ?? null,
      takenAt: photo.takenAt.toISOString(),
    })),
    hasSignature: rows.podSignaturePath !== null,
    signatureUrl:
      rows.podSignaturePath === null
        ? null
        : (signed[rows.podSignaturePath] ?? null),
  };
}
