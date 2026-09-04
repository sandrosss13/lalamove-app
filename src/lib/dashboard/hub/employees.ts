/**
 * The Driver Hub's Employees & roles screen.
 *
 * Business accounts only — `getHubEmployees()` returns `null` for an individual
 * account, the same three-way guard the Drivers screen uses (nav, page
 * redirect, loader).
 *
 * ## This screen has almost no real data, and says so
 *
 * There is no `Employee` model, no membership record and no invitation flow
 * anywhere in the schema. So this loader does exactly one piece of database
 * work — confirming the signed-in company exists and reading its name for the
 * subhead — and everything else comes from `@/lib/dashboard/hub/sample`.
 *
 * That makes the return type's job unusually important. It keeps three things
 * apart that the screen must not blur:
 *
 * 1. `companyName` — **real**, read from `LogisticsCompany`.
 * 2. `roleDefinitions` — **real product content**. The five roles and their
 *    permission matrices are the specification for what the product offers a
 *    fleet; they live in `sample.ts` only because there is no `EmployeeRole`
 *    model to hang them off yet, and `sample.ts` says so in its own banner.
 *    They must **not** render a `<SampleNote />`.
 * 3. `roster` and `tiles` — **fictional people and counts**, flagged by
 *    `rosterIsSample` so the screen cannot render them unbadged by accident.
 *
 * Conflating (2) with (3) would be the one mistake on this screen that actually
 * misleads: an operator dismissing the permission matrix as placeholder copy
 * would be dismissing the real access-control design.
 *
 * `mutationsEnabled` is `false` for the same honesty reason: there is no invite
 * endpoint and no remove endpoint, so both controls ship visibly disabled
 * rather than silently dropping what the operator typed.
 *
 * Server-only, and everything it returns is plain serialisable data.
 */
import "server-only";

import type { HubAccount } from "@/lib/dashboard/hub/account";
import type {
  EmployeeRoleDefinition,
  SampleEmployee,
} from "@/lib/dashboard/hub/sample";
import {
  EMPLOYEE_ROLE_ORDER,
  SAMPLE_EMPLOYEE_ROSTER,
  SAMPLE_EMPLOYEE_TILES,
  employeeRoleDefinition,
} from "@/lib/dashboard/hub/sample";
import { prisma } from "@/lib/prisma";

/** The numbers behind "<Company> · N people, M roles · K invite pending". */
export type HubEmployeesSubhead = {
  /** Real. */
  companyName: string;
  /** Sample — the roster's own size. */
  peopleCount: number;
  /** Sample — see `getHubEmployees()` for why this is stated, not derived. */
  roleCount: number;
  /** Sample — roster entries still awaiting acceptance. */
  invitesPendingCount: number;
};

export type HubEmployeesData = {
  subhead: HubEmployeesSubhead;
  /**
   * **Real product content.** The five roles in the order the invite form
   * offers them, most privileged first. Renders without a sample badge.
   */
  roleDefinitions: readonly EmployeeRoleDefinition[];
  /** **Fictional.** Every person here is invented; see `rosterIsSample`. */
  roster: readonly SampleEmployee[];
  /** **Fictional.** The four tiles, stated rather than derived from `roster`. */
  tiles: typeof SAMPLE_EMPLOYEE_TILES;
  /**
   * Always `true` today. A literal rather than a boolean so the flag reads as a
   * standing fact about this screen, and so deleting it when an `Employee`
   * model lands is a type error at every call site rather than a silent
   * flip to `false`.
   */
  rosterIsSample: true;
  /**
   * Always `false` today: neither "Invite employee" nor "Remove employee" has a
   * backing endpoint. The screen renders both controls disabled with a short
   * note. Same literal-type reasoning as `rosterIsSample`.
   */
  mutationsEnabled: false;
};

/**
 * Shapes the Employees screen for the signed-in company.
 *
 * Returns `null` for anything that is not a business account, and also when the
 * company row is missing — which sign-up always creates, so it only happens if
 * onboarding was interrupted part-way. Both cases are the caller's to render,
 * the same contract `getCompanyDashboardData()` states for its own `null`.
 */
export async function getHubEmployees(
  account: HubAccount,
): Promise<HubEmployeesData | null> {
  if (account.kind !== "BUSINESS") {
    return null;
  }

  // Keyed on the session's `userId` rather than on `account.companyId`, which is
  // the pattern every `logistics-company/**` route uses: the lookup is then
  // inherently scoped to the caller and cannot be pointed at another company's
  // row. This is the only query on the screen.
  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: account.userId },
    select: { companyName: true },
  });

  if (!company) {
    return null;
  }

  const invitesPendingCount = SAMPLE_EMPLOYEE_ROSTER.filter(
    (employee) => employee.status === "Invited",
  ).length;

  return {
    subhead: {
      companyName: company.companyName,
      peopleCount: SAMPLE_EMPLOYEE_ROSTER.length,
      // Taken from the stated tile rather than counted off the roster on
      // purpose. The roster uses all five roles, but the design's subhead and
      // its "Roles in use" tile both say four — the employed Driver role is not
      // counted as an operator role. Deriving it here would put a number on the
      // subhead that contradicts the tile directly beside it.
      roleCount: SAMPLE_EMPLOYEE_TILES.rolesInUse.value,
      invitesPendingCount,
    },
    // Materialised in `EMPLOYEE_ROLE_ORDER` so the screen renders the invite
    // form's radio rows and the permission matrix from one already-ordered
    // list, instead of each re-deriving the order from the record.
    roleDefinitions: EMPLOYEE_ROLE_ORDER.map(employeeRoleDefinition),
    roster: SAMPLE_EMPLOYEE_ROSTER,
    tiles: SAMPLE_EMPLOYEE_TILES,
    rosterIsSample: true,
    mutationsEnabled: false,
  };
}
