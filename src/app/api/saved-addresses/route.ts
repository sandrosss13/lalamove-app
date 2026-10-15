import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { prisma } from "@/lib/prisma";
import { SAVED_ADDRESS_LIMIT } from "@/lib/saved-addresses/contract";
import {
  parseSavedAddressBody,
  resolveLabel,
} from "@/lib/saved-addresses/parse-input";
import {
  SAVED_ADDRESS_SELECT,
  toSavedAddressDto,
} from "@/lib/saved-addresses/serialize";
import {
  findDuplicateId,
  isBusinessClient,
  requireClient,
} from "@/lib/saved-addresses/server";

/**
 * GET /api/saved-addresses — the signed-in client's saved addresses, most
 * recently used first.
 *
 * Scope is the session's own account; there is no client id in the query and
 * there must never be one — the `clientId` clause is the tenancy boundary.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const caller = await requireClient(request, t);
  if ("response" in caller) return caller.response;
  const { clientId } = caller;

  const [rows, isBusiness] = await Promise.all([
    prisma.savedAddress.findMany({
      where: { clientId },
      orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }],
      select: SAVED_ADDRESS_SELECT,
    }),
    isBusinessClient(clientId),
  ]);

  return NextResponse.json(
    { addresses: rows.map((row) => toSavedAddressDto(row, isBusiness)) },
    { status: 200 },
  );
}

/**
 * POST /api/saved-addresses — save a stop for the signed-in client.
 *
 * The same place saved again (see `normaliseAddressKey`) updates the existing
 * row — contact fields, coordinates and label, and it counts as a use — and
 * answers 200 `{ address, duplicate: true }`; a blank label then keeps the
 * row's current one rather than overwriting "Home" with the address. A new
 * place past `SAVED_ADDRESS_LIMIT` is a 409. A BUSINESS client's comment is
 * stored as "", as their bookings drop it.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const caller = await requireClient(request, t);
  if ("response" in caller) return caller.response;
  const { clientId } = caller;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  const parsed = parseSavedAddressBody(rawBody, t);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const isBusiness = await isBusinessClient(clientId);
  const { label, ...fields } = parsed.data;
  const data = { ...fields, comment: isBusiness ? "" : fields.comment };

  const result = await prisma.$transaction(async (tx) => {
    const duplicateId = await findDuplicateId(tx, clientId, data.address);

    if (duplicateId) {
      const address = await tx.savedAddress.update({
        where: { id: duplicateId },
        data: {
          ...data,
          ...(label.length > 0 ? { label } : {}),
          lastUsedAt: new Date(),
        },
        select: SAVED_ADDRESS_SELECT,
      });
      return { kind: "duplicate" as const, address };
    }

    const count = await tx.savedAddress.count({ where: { clientId } });
    if (count >= SAVED_ADDRESS_LIMIT) {
      return { kind: "limit" as const };
    }

    const address = await tx.savedAddress.create({
      data: { ...data, clientId, label: resolveLabel(label, data.address) },
      select: SAVED_ADDRESS_SELECT,
    });
    return { kind: "created" as const, address };
  });

  if (result.kind === "limit") {
    return NextResponse.json(
      {
        error: t("errors.savedAddresses.limitReached", {
          max: SAVED_ADDRESS_LIMIT,
        }),
      },
      { status: 409 },
    );
  }

  const address = toSavedAddressDto(result.address, isBusiness);
  return result.kind === "duplicate"
    ? NextResponse.json({ address, duplicate: true }, { status: 200 })
    : NextResponse.json({ address }, { status: 201 });
}
