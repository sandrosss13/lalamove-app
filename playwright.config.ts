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
 * Where the browser specs point.
 *
 * Defaults to the local dev server so `pnpm test` works with nothing set, and
 * takes a deployed origin from `E2E_BASE_URL` when there is one. Either target
 * is safe: every browser spec stops short of creating an order, and the only
 * endpoint they call, `POST /api/pricing/estimate`, computes and returns
 * without writing a row.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

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
   * Start the dev server only when no external target was named. Pointing the
   * suite at a deployment with `E2E_BASE_URL` should not also boot a local
   * server it will never visit.
   *
   * `reuseExistingServer` keeps a dev server the developer already has running
   * on port 3000, which is the common case locally and saves a cold Next.js
   * compile per run.
   *
   * READ THIS BEFORE ADDING A TEST THAT WRITES. There is no dev or staging
   * database on this project: `DATABASE_URL` is production. So a bare
   * `pnpm test` boots a dev server against the live database. Today that is
   * safe because the whole suite only reads — it calls `GET /` and
   * `POST /api/pricing/estimate`, which computes and returns without
   * persisting. A test that books an order would put a real job on the live
   * driver load board, and this app has no client-side cancel, so it could be
   * accepted by a real driver and could not be withdrawn. Anything needing a
   * write needs a test database first; delete this block at that point so a
   * target has to be named explicitly rather than defaulted into.
   */
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        // A cold Next.js dev boot compiles the landing route on first request,
        // which is well beyond the 60s default on a laptop.
        timeout: 180_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
