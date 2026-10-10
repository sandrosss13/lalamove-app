/**
 * Reading an order's cargo photos for display: the rows, with a short-lived
 * signed read URL each. Shared by every page that shows an order's details, so
 * the select, the ordering and the failure handling are written once.
 *
 * **Never call this before the caller's access to the order is established.**
 * It takes an order id and returns readable URLs; deciding who may see them is
 * the page's tenancy check, not this function's.
 */

import "server-only";

import { getOrderPhotoSignedUrls } from "@/lib/order-photo-storage";
import { prisma } from "@/lib/prisma";

/** One photo as a page renders it. */
export type OrderPhotoView = {
  id: string;
  /** Signed read URL, valid for a few minutes from the render. */
  url: string;
};

/**
 * The order's photos, oldest first (the order the client added them in), each
 * with a signed URL.
 *
 * Degrades rather than throws: a photo whose URL could not be signed is left
 * out, and a Storage outage — or an environment with no Supabase configured —
 * yields an empty list and a log line. The photos are supporting detail on
 * pages whose real job is the order itself, and must never be the reason one
 * fails to render.
 */
export async function loadOrderPhotoViews(
  orderId: string,
): Promise<OrderPhotoView[]> {
  const photos = await prisma.orderPhoto.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    select: { id: true, storagePath: true },
  });

  if (photos.length === 0) {
    return [];
  }

  let signedUrls: Record<string, string>;
  try {
    signedUrls = await getOrderPhotoSignedUrls(
      photos.map((photo) => photo.storagePath),
    );
  } catch (error) {
    console.error("Failed to sign cargo photo URLs", { orderId, error });
    return [];
  }

  return photos.flatMap((photo) => {
    const url = signedUrls[photo.storagePath];
    return url ? [{ id: photo.id, url }] : [];
  });
}
