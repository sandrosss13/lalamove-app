import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { prisma } from "@/lib/prisma";
import {
  parseSavedAddressBody,
  resolveLabel,
} from "@/lib/saved-addresses/parse-input";
import {
  SAVED_ADDRESS_NOT_FOUND_KEY,
  SAVED_ADDRESS_SELECT,
  toSavedAddressDto,
} from "@/lib/saved-addresses/serialize";
import {
  findDuplicateId,
  isBusinessClient,
  requireClient,
} from "@/lib/saved-addresses/server";

/**
 * PATCH /api/saved-addresses/[id] — edit one of the signed-in client's saved
 * addresses. Every field is optional; an omitted one keeps its stored value.
 * A blank label falls back to the (possibly new) address. Changing the address
 * to one this client already has saved under another row is a 409, so the
 * "one row per place" rule POST keeps cannot be broken by an edit.
 *
 * Ownership is part of every lookup: another client's id is a 404.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const caller = await requireClient(request, t, {
    notFoundForOtherRoles: true,
  });
  if ("response" in caller) return caller.response;
  const { clientId } = caller;
  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  const parsed = parseSavedAddressBody(rawBody, t, { partial: true });
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const isBusiness = await isBusinessClient(clientId);
  const { label, ...fields } = parsed.data;
  if (isBusiness && fields.comment !== undefined) {
    fields.comment = "";
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.savedAddress.findFirst({
      where: { id, clientId },
      select: { id: true, address: true },
    });
    if (!existing) return { kind: "notFound" as const };

    const address = fields.address ?? existing.address;
    if (
      fields.address !== undefined &&
      (await findDuplicateId(tx, clientId, address, existing.id))
    ) {
      return { kind: "duplicate" as const };
    }

    const row = await tx.savedAddress.update({
      where: { id: existing.id },
      data: {
        ...fields,
        ...(label !== undefined ? { label: resolveLabel(label, address) } : {}),
      },
      select: SAVED_ADDRESS_SELECT,
    });
    return { kind: "updated" as const, row };
  });

  if (result.kind === "notFound") {
    return NextResponse.json(
      { error: t(SAVED_ADDRESS_NOT_FOUND_KEY) },
      { status: 404 },
    );
  }
  if (result.kind === "duplicate") {
    return NextResponse.json(
      { error: t("errors.savedAddresses.addressAlreadySaved") },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { address: toSavedAddressDto(result.row, isBusiness) },
    { status: 200 },
  );
}

/**
 * DELETE /api/saved-addresses/[id] — remove one of the signed-in client's
 * saved addresses. Orders never reference a saved address (they copy it), so
 * nothing else changes.
 */
export async function DELETE(
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
  const { count } = await prisma.savedAddress.deleteMany({
    where: { id, clientId: caller.clientId },
  });

  if (count === 0) {
    return NextResponse.json(
      { error: t(SAVED_ADDRESS_NOT_FOUND_KEY) },
      { status: 404 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
