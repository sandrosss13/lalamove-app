import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { CARD_NOT_FOUND } from "../card-select";

/**
 * DELETE /api/saved-cards/[id] — remove one of the signed-in client's saved
 * cards.
 *
 * Ownership is part of the lookup, so another client's card simply does not
 * match and is reported as a 404. Removing the default promotes the newest
 * remaining card in the same transaction, so the client is never left holding
 * cards with no default among them.
 *
 * `Order.savedCardId` is `onDelete: SetNull`, so historic orders survive with a
 * null card reference — that is intended: an order records what was paid, not a
 * card the client is still keeping.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "CLIENT") {
    return NextResponse.json({ error: CARD_NOT_FOUND }, { status: 404 });
  }

  const { id } = await params;
  const clientId = session.user.id;

  const removed = await prisma.$transaction(async (tx) => {
    // Scoped by owner, so this returns nothing for another client's card.
    const existing = await tx.savedCard.findFirst({
      where: { id, clientId },
      select: { id: true, isDefault: true },
    });

    if (!existing) {
      return false;
    }

    await tx.savedCard.delete({ where: { id: existing.id } });

    if (existing.isDefault) {
      // Newest first, matching the order the wallet lists them in, so the card
      // promoted is the one sitting at the top of the remaining list.
      const next = await tx.savedCard.findFirst({
        where: { clientId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      if (next) {
        await tx.savedCard.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    return true;
  });

  if (!removed) {
    return NextResponse.json({ error: CARD_NOT_FOUND }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
