import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { CARD_NOT_FOUND, CARD_SELECT } from "../../card-select";

/**
 * POST /api/saved-cards/[id]/default — make one of the signed-in client's saved
 * cards their default.
 *
 * The promotion and the demotion of the previous default are one transaction,
 * so a client never has two defaults or none. Ownership is part of the lookup,
 * so another client's card does not match and is reported as a 404.
 */
export async function POST(
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

  const card = await prisma.$transaction(async (tx) => {
    // Scoped by owner, so this returns nothing for another client's card.
    const existing = await tx.savedCard.findFirst({
      where: { id, clientId },
      select: { id: true },
    });

    if (!existing) {
      return null;
    }

    await tx.savedCard.updateMany({
      where: { clientId, isDefault: true, id: { not: existing.id } },
      data: { isDefault: false },
    });

    return tx.savedCard.update({
      where: { id: existing.id },
      data: { isDefault: true },
      select: CARD_SELECT,
    });
  });

  if (!card) {
    return NextResponse.json({ error: CARD_NOT_FOUND }, { status: 404 });
  }

  return NextResponse.json({ card }, { status: 200 });
}
