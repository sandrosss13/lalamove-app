import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright is the project's only test runner. The pure-function specs live in
 * it alongside the browser ones rather than in a second framework: a unit
 * runner would buy nothing here that `test`/`expect` does not already provide,
 * and two runners means two configs, two watch modes and two sets of
 * conventions for one suite of a few dozen assertions.
 *
 * A spec that needs no page never launches a browser — Playwright only starts
 * one when a test asks for the `page` or `browser` fixture — so the arithmetic
 * specs run at unit-test speed.
 */

/**
 * Where the browser specs point. Required, with no default.
 *
 * It used to default to `http://localhost:3000` so `pnpm test` worked with
 * nothing set, and the `webServer` block below would boot `pnpm dev` to serve
 * it. That is the part that had to go: `pnpm dev` reads `DATABASE_URL` from
 * `.env`, and on this project that is production. So the convenient default
 * was a suite that silently pointed a browser at the live database.
 *
 * Today's specs only read — they call `GET /` and `POST /api/pricing/estimate`,
 * which computes and returns without persisting — so that default was not
 * actually doing damage. It was one written test away from doing so: a spec
 * that books an order would put a real job on the live driver load board, and
 * this app gives the client no way to cancel one.
 *
 * Throwing is the point. An unset variable is a developer who has not said
 * which database they are about to write to, and the only safe answer to that
 * question is to refuse to guess: a wrong target has to be a typo somebody
 * wrote, never a default somebody forgot.
 */
const baseURL = process.env.E2E_BASE_URL;

if (!baseURL) {
  throw new Error(
    "E2E_BASE_URL is required — this suite's target must be named rather " +
      "than defaulted into, because `DATABASE_URL` on this project is " +
      "production. Point it at a server already running against a test " +
      "database, e.g. E2E_BASE_URL=http://localhost:3001 pnpm test",
  );
}

export default defineConfig({
  testDir: "./tests",

  /**
   * One worker, not one per core. `POST /api/pricing/estimate` is rate limited
   * to six calls a minute per caller (`src/app/api/pricing/estimate/route.ts`)
   * and every worker on this machine shares one address, so parallel workers
   * would race each other into a 429 rather than into a quote.
   */
  workers: 1,
  fullyParallel: false,

  /**
   * No retries, for the same budget. A retried quote spends another three
   * LocationIQ lookups against that limit, so a retry is more likely to turn a
   * flake into a rate-limit failure than into a pass — and a failure on this
   * suite is worth reading rather than re-rolling.
   */
  retries: 0,

  /** A stray `test.only` fails CI rather than quietly narrowing the run. */
  forbidOnly: Boolean(process.env.CI),

  reporter: process.env.CI ? "line" : "list",

  use: {
    baseURL,
    // Retained only for a failure, since there are no retries to attach it to.
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /**
   * There is deliberately no `webServer` key.
   *
   * There used to be one: it ran `pnpm dev` whenever `E2E_BASE_URL` was unset,
   * and its own comment said to delete it as soon as a test that writes was
   * added, so that a target had to be named explicitly rather than defaulted
   * into.
   *
   * It is gone ahead of that test rather than with it. `pnpm dev` reads
   * `DATABASE_URL` from `.env`, and on this project that is production, so a
   * booted-by-default server is a server wired to the live database — and the
   * first spec that books a delivery would put real jobs on the live driver
   * load board, which this app gives the client no way to cancel. Nothing in a
   * config can make `pnpm dev` safe to start on a developer's behalf, so the
   * config stops starting servers at all.
   *
   * Run the suite against a server somebody has already pointed at a test
   * database, and say which one:
   *
   *   E2E_BASE_URL=http://localhost:3001 pnpm test
   *
   * A local test database can be set up with:
   *
   *   createdb lalamove_test
   *   DATABASE_URL=postgresql://localhost:5432/lalamove_test \
   *     npx prisma migrate deploy && npx prisma db seed
   *
   * Do not reintroduce this key without also giving `pnpm dev` a database URL
   * that is not production.
   */
});
