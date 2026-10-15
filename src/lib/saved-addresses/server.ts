/**
 * Database-bound helpers for the saved-address routes: who the caller is, and
 * whether an address is already saved. `server-only` — the pure half lives in
 * `./parse-input.ts` and `./serialize.ts`.
 */

import "server-only";

import { ClientAccountType } from "@prisma/client";
import { NextResponse } from "next/server";

import type { RequestTranslator } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { normaliseAddressKey } from "./parse-input";
import { SAVED_ADDRESS_NOT_FOUND_KEY } from "./serialize";

/**
 * The signed-in CLIENT's id, or the response to send instead: 401 signed out,
 * 403 for any other role on the collection route. On a single-address route
 * (`notFoundForOtherRoles`) a non-client gets the same 404 an unknown id does,
 * like `DELETE /api/saved-cards/[id]`.
 */
export async function requireClient(
  request: Request,
  t: RequestTranslator,
  options: { notFoundForOtherRoles?: boolean } = {},
): Promise<{ clientId: string } | { response: NextResponse }> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return {
      response: NextResponse.json(
        { error: t("common.shared.unauthorized") },
        { status: 401 },
      ),
    };
  }

  if (session.user.role !== "CLIENT") {
    return {
      response: options.notFoundForOtherRoles
        ? NextResponse.json(
            { error: t(SAVED_ADDRESS_NOT_FOUND_KEY) },
            { status: 404 },
          )
        : NextResponse.json(
            { error: t("errors.savedAddresses.onlyClientsHaveSavedAddresses") },
            { status: 403 },
          ),
    };
  }

  return { clientId: session.user.id };
}

/**
 * Whether this client books as a BUSINESS — the same `ClientProfile` read
 * `prepareOrderWrite` uses to drop a business client's stop comments. No
 * profile reads as an individual.
 */
export async function isBusinessClient(clientId: string): Promise<boolean> {
  const profile = await prisma.clientProfile.findUnique({
    where: { userId: clientId },
    select: { accountType: true },
  });
  return profile?.accountType === ClientAccountType.BUSINESS;
}

/**
 * The id of this client's saved address that names the same place as
 * `address` (see `normaliseAddressKey`), or null. Compared in application code
 * over the client's rows — at most `SAVED_ADDRESS_LIMIT` of them — since the
 * normalisation is not something an index can express.
 */
export async function findDuplicateId(
  db: Pick<typeof prisma, "savedAddress">,
  clientId: string,
  address: string,
  excludeId?: string,
): Promise<string | null> {
  const key = normaliseAddressKey(address);
  const rows = await db.savedAddress.findMany({
    where: { clientId },
    select: { id: true, address: true },
  });
  return (
    rows.find(
      (row) => row.id !== excludeId && normaliseAddressKey(row.address) === key,
    )?.id ?? null
  );
}
