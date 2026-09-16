/**
 * The job sheet's tenancy rule: which account may read `/dashboard/jobs/[id]`.
 *
 * One page answers two audiences — a driver, whose claim on an order is
 * `Order.driverId`, and a logistics company, whose claim is `Order.companyId` —
 * and `src/lib/dashboard/hub/job-sheet-access.ts` is the only place that rule is
 * written. `getHubJobSheet` calls `canViewJobSheet` once and returns an
 * undifferentiated `null` for every refusal, so if these two functions are wrong
 * the page hands a stranger a client's stop contacts and the payout on a job.
 *
 * **Why the functions and not the page.** Asserting through HTTP would mean a
 * signed-in fleet session and an order in a known dispatch state — writes
 * against a database, and `DATABASE_URL` on this project points at production
 * (see `playwright.config.ts` and `tests/carrier-payload-redaction.spec.ts`,
 * which records the same constraint for the redaction it pins). The access
 * module is nonetheless the right thing to pin: it is the entire rule, the
 * loader's only use of it is a single call, and the module deliberately carries
 * no runtime imports — no `server-only`, no Prisma — so this spec constructs
 * nothing, connects to nothing and needs no browser fixture.
 *
 * The orders below are plain literals of the two columns the rule reads. They
 * are not `Order` rows and are not meant to be: `canViewJobSheet` is typed on
 * `{ driverId, companyId }` precisely so that the rule can be exercised without
 * a database behind it.
 */

import { expect, test } from "@playwright/test";

import {
  canViewJobSheet,
  resolveJobSheetScope,
  type HubJobSheetScope,
} from "@/lib/dashboard/hub/job-sheet-access";

/** The signed-in driver in every case below. */
const DRIVER_USER_ID = "user_driver_nino";

/** Somebody else entirely — another driver on the same platform. */
const OTHER_DRIVER_USER_ID = "user_driver_giorgi";

/** The signed-in fleet in every case below. */
const COMPANY_ID = "company_tbilisi_freight";

/** A competing fleet, with its own orders and no claim on this one's. */
const OTHER_COMPANY_ID = "company_rustavi_haulage";

const driverScope: HubJobSheetScope = {
  kind: "DRIVER",
  userId: DRIVER_USER_ID,
};

const companyScope: HubJobSheetScope = {
  kind: "COMPANY",
  companyId: COMPANY_ID,
};

test.describe("canViewJobSheet — a driver's claim", () => {
  test("admits the order assigned to them", () => {
    expect(
      canViewJobSheet(
        { driverId: DRIVER_USER_ID, companyId: null },
        driverScope,
      ),
    ).toBe(true);
  });

  test("admits it even when a fleet holds the order too", () => {
    // A dispatched company order: the employer holds it and the employee runs
    // it. Both are true claims, and this one is the driver's.
    expect(
      canViewJobSheet(
        { driverId: DRIVER_USER_ID, companyId: COMPANY_ID },
        driverScope,
      ),
    ).toBe(true);
  });

  test("refuses another driver's order", () => {
    expect(
      canViewJobSheet(
        { driverId: OTHER_DRIVER_USER_ID, companyId: null },
        driverScope,
      ),
    ).toBe(false);
  });

  test("refuses a company-held order with no driver dispatched yet", () => {
    // The state a fleet's order sits in between claim and dispatch. Nobody is
    // driving it, so no driver may open it — least of all one who happens to
    // work for the company, whose claim is their employer's and not their own.
    expect(
      canViewJobSheet({ driverId: null, companyId: COMPANY_ID }, driverScope),
    ).toBe(false);
  });
});

test.describe("canViewJobSheet — a company's claim", () => {
  test("admits the order it holds", () => {
    expect(
      canViewJobSheet({ driverId: null, companyId: COMPANY_ID }, companyScope),
    ).toBe(true);
  });

  test("admits it once dispatched to an employee", () => {
    // The bug this whole change exists for: `GET /api/loads` calls this load
    // `"mine"` for the fleet by `companyId`, while `driverId` names an employee
    // and never the owner. A `driverId`-only rule answered the owner's own
    // "Open job sheet" link with a not-found.
    expect(
      canViewJobSheet(
        { driverId: OTHER_DRIVER_USER_ID, companyId: COMPANY_ID },
        companyScope,
      ),
    ).toBe(true);
  });

  test("refuses another company's order", () => {
    expect(
      canViewJobSheet(
        { driverId: null, companyId: OTHER_COMPANY_ID },
        companyScope,
      ),
    ).toBe(false);
  });

  test("refuses another company's order even when a driver is on it", () => {
    // A dispatched order belonging to a competitor. The driver on it is not the
    // question: the order is held by `OTHER_COMPANY_ID`, so this fleet sees
    // nothing of its stops, its contacts or its payout.
    expect(
      canViewJobSheet(
        { driverId: OTHER_DRIVER_USER_ID, companyId: OTHER_COMPANY_ID },
        companyScope,
      ),
    ).toBe(false);
  });
});

test.describe("canViewJobSheet — the unclaimed order", () => {
  /** An order on the open board: placed and paid for, claimed by nobody. */
  const openMarketOrder = { driverId: null, companyId: null };

  /**
   * This is the regression `HubJobSheetScope` exists to make unrepresentable,
   * and the reason neither variant carries a nullable id.
   *
   * On a `HubAccount` both tenancy ids are `string | null`. Compare one of those
   * straight against an order and an unclaimed row — `driverId: null`,
   * `companyId: null` — satisfies it by `null === null`, which would hand this
   * account the full job sheet for **every open load on the platform**: the
   * client's named stop contacts, their phone numbers and the payout on work
   * nobody has committed to. The same trap is documented against the load board
   * at `src/app/api/loads/route.ts:441-452`, where it is only avoided because a
   * caller a hundred lines earlier refuses a null `companyId` first.
   *
   * These two assertions are the behavioural half of the guarantee. The
   * structural half is that neither call below could have been written with a
   * null id in the scope, because the type does not permit one.
   */
  test("is refused by a driver scope", () => {
    expect(canViewJobSheet(openMarketOrder, driverScope)).toBe(false);
  });

  test("is refused by a company scope", () => {
    expect(canViewJobSheet(openMarketOrder, companyScope)).toBe(false);
  });
});

test.describe("resolveJobSheetScope", () => {
  test("scopes a BUSINESS account by its company", () => {
    expect(
      resolveJobSheetScope({
        kind: "BUSINESS",
        userId: DRIVER_USER_ID,
        companyId: COMPANY_ID,
      }),
    ).toEqual({ kind: "COMPANY", companyId: COMPANY_ID });
  });

  test("refuses a BUSINESS account with no company row yet", () => {
    // An interrupted fleet onboarding. `null` is the only safe answer: a scope
    // built from this account would have to carry a null `companyId`, which is
    // the open-market leak above. The page renders its not-found.
    expect(
      resolveJobSheetScope({
        kind: "BUSINESS",
        userId: DRIVER_USER_ID,
        companyId: null,
      }),
    ).toBeNull();
  });

  test("scopes an INDIVIDUAL account by its user id", () => {
    expect(
      resolveJobSheetScope({
        kind: "INDIVIDUAL",
        userId: DRIVER_USER_ID,
        companyId: null,
      }),
    ).toEqual({ kind: "DRIVER", userId: DRIVER_USER_ID });
  });

  test("scopes a ROSTER driver as a driver, not as their employer", () => {
    // `companyId` on an INDIVIDUAL account names the driver's *employer*. An
    // employee's view of a job is the job they were dispatched, never every job
    // the fleet holds, so the company id is deliberately not read here.
    expect(
      resolveJobSheetScope({
        kind: "INDIVIDUAL",
        userId: DRIVER_USER_ID,
        companyId: COMPANY_ID,
      }),
    ).toEqual({ kind: "DRIVER", userId: DRIVER_USER_ID });
  });

  test("never produces a scope carrying a null id", () => {
    // A positive sweep over every account shape this function can be handed, so
    // that a future branch returning a scope built from a nullable field is
    // caught by this file rather than by an audit. The type already forbids it;
    // this asserts the type is still the one being returned.
    const accounts = [
      { kind: "BUSINESS", userId: DRIVER_USER_ID, companyId: COMPANY_ID },
      { kind: "BUSINESS", userId: DRIVER_USER_ID, companyId: null },
      { kind: "INDIVIDUAL", userId: DRIVER_USER_ID, companyId: null },
      { kind: "INDIVIDUAL", userId: DRIVER_USER_ID, companyId: COMPANY_ID },
    ] as const;

    for (const account of accounts) {
      const scope = resolveJobSheetScope(account);

      if (scope === null) {
        continue;
      }

      const id = scope.kind === "DRIVER" ? scope.userId : scope.companyId;

      expect(id).not.toBeNull();
      expect(typeof id).toBe("string");
      expect(id).not.toBe("");
    }
  });
});
