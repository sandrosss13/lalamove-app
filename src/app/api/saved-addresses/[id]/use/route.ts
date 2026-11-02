import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { prisma } from "@/lib/prisma";
import { SAVED_ADDRESS_NOT_FOUND_KEY } from "@/lib/saved-addresses/serialize";
import { requireClient } from "@/lib/saved-addresses/server";

/**
 * POST /api/saved-addresses/[id]/use — mark one of the signed-in client's
 * saved addresses as just used, moving it to the top of the list. Called by
 * the booking form when a saved address is picked. No body.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const caller = await requireClient(request, t, {
    notFoundForOtherRoles: true,
  });
  if ("response" in caller) return caller.response;
  const { id } = await params;

  // Scoped by owner, so another client's id simply matches nothing.
  const { count } = await prisma.savedAddress.updateMany({
    where: { id, clientId: caller.clientId },
    data: { lastUsedAt: new Date() },
  });

  if (count === 0) {
    return NextResponse.json(
      { error: t(SAVED_ADDRESS_NOT_FOUND_KEY) },
      { status: 404 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
