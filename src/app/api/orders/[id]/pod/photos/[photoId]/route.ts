import type { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import type {
  OrderActionErrorResponse,
  PodPhotoDeleteResponse,
} from "@/lib/mobile-api/contracts";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import { orderActionError } from "@/lib/orders/action-errors";
import { ORDER_PROOF_SELECT, toOrderProof } from "@/lib/orders/pod";
import { discardPodObjects } from "@/lib/pod-storage";
import { prisma } from "@/lib/prisma";
import {
  lockOrderForPod,
  podInvalidState,
  resolvePodContext,
} from "../../guard";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/orders/[id]/pod/photos/[photoId] — remove one proof-of-delivery
 * photo before the delivery is confirmed.
 *
 * Only the assigned driver, only while the order is `IN_TRANSIT`: once a job is
 * `COMPLETED` its proof is frozen, which is what makes it proof. The delete
 * runs under the same order lock the completion takes, so a completion can
 * never be left holding zero photos by a delete that raced it.
 *
 * A photo id that is not on this order — unknown, or another order's — is the
 * same 404, so ids cannot be probed. Answers with the order's remaining proof.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
): Promise<NextResponse<PodPhotoDeleteResponse | OrderActionErrorResponse>> {
  const t = await getRequestTranslations();
  const { id, photoId } = await params;

  const guard = await resolvePodContext(request, id, t);
  if ("response" in guard) {
    return guard.response;
  }

  const { context } = guard;

  const outcome = await prisma.$transaction(async (tx) => {
    if (!(await lockOrderForPod(tx, context))) {
      return { invalidState: true } as const;
    }

    const photo = await tx.podPhoto.findFirst({
      where: { id: photoId, orderId: context.orderId },
      select: { id: true, storagePath: true },
    });

    if (!photo) {
      return { notFound: true } as const;
    }

    await tx.podPhoto.delete({ where: { id: photo.id } });

    return { storagePath: photo.storagePath } as const;
  });

  if ("invalidState" in outcome) {
    return podInvalidState(t);
  }

  if ("notFound" in outcome) {
    return orderActionError(
      t("errors.ordersPod.photoNotFound"),
      "NOT_FOUND",
      404,
    );
  }

  await discardPodObjects([outcome.storagePath]);

  const rows = await prisma.order.findUniqueOrThrow({
    where: { id: context.orderId },
    select: ORDER_PROOF_SELECT,
  });

  return hubApiOk<PodPhotoDeleteResponse>(await toOrderProof(rows));
}
