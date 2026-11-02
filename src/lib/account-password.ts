import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Whether the user can sign in with a password — and so whether Better Auth's
 * `changePassword` can ever succeed for them.
 *
 * Better Auth keeps an email/password login as an `Account` row with
 * `providerId: "credential"` and the hash in `password`. A phone-number account
 * (an SMS code, no password) has no such row, so the screens that render a
 * change-password card ask this first and leave the card out for it.
 */
export async function userHasPassword(userId: string): Promise<boolean> {
  const credential = await prisma.account.findFirst({
    where: { userId, providerId: "credential", password: { not: null } },
    select: { id: true },
  });

  return credential !== null;
}
