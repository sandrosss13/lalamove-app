/**
 * Who may read one order's job sheet, as a type rather than as a convention.
 *
 * The job sheet (`/dashboard/jobs/[id]`) answers two audiences with one page: a
 * driver, whose claim on an order is `Order.driverId`, and a logistics company,
 * whose claim is `Order.companyId`. They are two spellings of one tenancy rule —
 * *the order is held by this account* — and this module is the single place that
 * rule is written down, so `getHubJobSheet` has one check to run and the page
 * has one thing to pass it.
 *
 * ## Why this file has no imports it could not erase
 *
 * Deliberately no `import "server-only"`, no Prisma client and no `@prisma/client`
 * value import: this is the module the access rule is *tested* in, and
 * `tests/job-sheet-access.spec.ts` runs it in a plain node process with no
 * database and no server. Two pure functions over plain object literals need
 * none of that, and a single runtime import would put the whole Prisma runtime
 * behind a test of six comparisons. `import type` is erased by the compiler, so
 * the `HubAccount` shape below costs nothing at runtime and the server-only
 * module it comes from is never loaded.
 *
 * Modelled on `LoadBoardScope` / `resolveScope` / `canSeeStopContacts` in
 * `src/app/api/loads/route.ts` (~:403-461), which solve the identical problem
 * for the load board. The two are deliberately separate: that scope carries a
 * `driverProfileId` the job sheet has no use for, and the board's rule is about
 * *stop contacts on an open market* while this one is about *a whole detail
 * page*. They share a shape and a reason, not a definition.
 */

import type { HubAccount } from "@/lib/dashboard/hub/account";

/**
 * The account asking for a job sheet, narrowed to the one id that decides it.
 *
 * **Each variant carries exactly one id, and that exclusivity is the safety
 * property — not tidiness.** On a `HubAccount` both `userId`-adjacent tenancy
 * ids are nullable (`companyId: string | null`), and an order nobody has claimed
 * yet has `companyId: null` and `driverId: null`. A comparison against a
 * nullable account id would therefore evaluate `null === null` and report
 * **every open load on the platform** as this account's own — handing out its
 * stop contacts, its client's phone numbers and the payout on a job the account
 * has committed to nothing for. The trap is documented at length at
 * `src/app/api/loads/route.ts:441-452`, where the same comparison is only safe
 * because a caller a hundred lines away 403s on a null `companyId` first.
 *
 * Here the guarantee is structural instead of positional: `companyId` on the
 * COMPANY variant is `string`, so the dangerous comparison does not type-check
 * rather than merely not currently being reached. Nothing downstream asserts it,
 * because nothing downstream is able to express it.
 *
 * `DRIVER` carries `userId` and not a `DriverProfile` id because a driver's
 * claim on an order is recorded as `Order.driverId`, which is the **User** id.
 * The two are not interchangeable.
 */
export type HubJobSheetScope =
  { kind: "DRIVER"; userId: string } | { kind: "COMPANY"; companyId: string };

/**
 * Narrow a resolved hub account to its job-sheet scope, or null if incomplete.
 *
 * A BUSINESS account with no `companyId` is an interrupted onboarding, not an
 * account that sees everything: it resolves to `null`, and the page renders its
 * not-found. Returning a scope with a null id is not among the options this
 * function has, which is the whole point of the union above.
 *
 * Every non-BUSINESS account — independent driver and roster driver alike — is a
 * DRIVER scope. A roster driver has a `companyId` naming their *employer*, and
 * it is deliberately not read here: an employee's view of a job is the job they
 * were dispatched, never every job their employer holds.
 */
export function resolveJobSheetScope(
  account: Pick<HubAccount, "kind" | "userId" | "companyId">,
): HubJobSheetScope | null {
  if (account.kind === "BUSINESS") {
    return account.companyId === null
      ? null
      : { kind: "COMPANY", companyId: account.companyId };
  }

  return { kind: "DRIVER", userId: account.userId };
}

/**
 * Whether this scope may read this order's job sheet.
 *
 * One rule in two shapes: a driver's order is one assigned to them, a company's
 * is one it holds. Neither branch can match an unclaimed order, because a scope
 * with a null id is unrepresentable — see `HubJobSheetScope`.
 *
 * Takes the narrowed scope and never the `HubAccount` it came from, for exactly
 * the reason `canSeeStopContacts` does.
 */
export function canViewJobSheet(
  order: { driverId: string | null; companyId: string | null },
  scope: HubJobSheetScope,
): boolean {
  return scope.kind === "DRIVER"
    ? order.driverId === scope.userId
    : order.companyId === scope.companyId;
}
