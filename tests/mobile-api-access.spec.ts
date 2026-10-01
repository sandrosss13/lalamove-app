/**
 * Who may read the Driver Hub's JSON routes (`/api/dashboard/hub/*`), and what
 * a refused caller is told.
 *
 * `hubApiDenialFor` is the whole rule: `requireHubApiAccount` reads the session
 * and answers whatever this returns. It is pinned here rather than through HTTP
 * for the reason `tests/job-sheet-access.spec.ts` gives — a signed-in request
 * needs a server wired to a database, and `DATABASE_URL` on this project is
 * production. The module carries no runtime imports, so this constructs
 * nothing and connects to nothing.
 */

import { expect, test } from "@playwright/test";

import { hubApiDenialFor } from "@/lib/mobile-api/access";

test.describe("hubApiDenialFor", () => {
  test("answers a missing session with 401", () => {
    // Also the suspended-account path: Better Auth's `/get-session` hook hands
    // back `null` for a suspended user, so suspension arrives here as "no user".
    expect(hubApiDenialFor(null)).toEqual({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(hubApiDenialFor(undefined)).toEqual({
      status: 401,
      code: "UNAUTHENTICATED",
    });
  });

  for (const role of ["DRIVER", "COMPANY"]) {
    test(`admits a ${role}`, () => {
      expect(hubApiDenialFor({ role, mustChangePassword: false })).toBeNull();
    });

    test(`admits a ${role} whose mustChangePassword was never set`, () => {
      // The column is optional on the session user; absent and null both mean
      // "no reset pending".
      expect(hubApiDenialFor({ role })).toBeNull();
      expect(hubApiDenialFor({ role, mustChangePassword: null })).toBeNull();
    });

    test(`refuses a ${role} still on a temporary password`, () => {
      expect(hubApiDenialFor({ role, mustChangePassword: true })).toEqual({
        status: 403,
        code: "PASSWORD_CHANGE_REQUIRED",
      });
    });
  }

  for (const role of ["CLIENT", "ADMIN", "SUPER_ADMIN", "", "driver"]) {
    test(`refuses role ${JSON.stringify(role)}`, () => {
      // An allowlist: anything that is not exactly DRIVER or COMPANY is out,
      // including a role this file has never heard of and a wrong-case one.
      expect(hubApiDenialFor({ role, mustChangePassword: false })).toEqual({
        status: 403,
        code: "ROLE_NOT_ALLOWED",
      });
    });
  }

  test("checks the forced password change before the role", () => {
    // The order `GET /api/loads` and the page guard both use. A CLIENT on a
    // temporary password is told to change it, not that the hub is not theirs:
    // no role may sidestep the reset by being refused for something else.
    expect(
      hubApiDenialFor({ role: "CLIENT", mustChangePassword: true }),
    ).toEqual({ status: 403, code: "PASSWORD_CHANGE_REQUIRED" });
  });
});
