/**
 * The time budget on work a request starts but must not wait on — offer and
 * route-alert matching — proved without a server or a database.
 *
 * `waitWithinBudget` (`src/lib/background/budget.ts`) is the whole mechanism;
 * `runMatchingWithinBudget` only supplies the budget and Next's `after()`. The
 * property that matters is the one in the first test: **a slow sweep does not
 * delay the response.** It is proved here with real timers and a piece of work
 * that takes far longer than the budget, because that is exactly the failure —
 * a lock wait, a cold connection — the budget exists for.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { waitWithinBudget } from "@/lib/background/budget";

const REPO = process.cwd();

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Options with spies, so each test states only what it cares about. */
function harness(budgetMs: number) {
  const kept: Promise<void>[] = [];
  const errors: unknown[] = [];

  return {
    kept,
    errors,
    options: {
      budgetMs,
      keepAlive: (pending: Promise<void>) => {
        kept.push(pending);
      },
      onError: (error: unknown) => {
        errors.push(error);
      },
    },
  };
}

test.describe("waitWithinBudget", () => {
  test("a slow sweep does not delay the response beyond the budget", async () => {
    const BUDGET_MS = 100;
    const SWEEP_MS = 1_500;
    const { kept, options } = harness(BUDGET_MS);
    let sweepFinished = false;

    const startedAt = Date.now();
    const outcome = await waitWithinBudget(async () => {
      await sleep(SWEEP_MS);
      sweepFinished = true;
    }, options);
    const waitedMs = Date.now() - startedAt;

    // The caller — the route about to answer — is released at the deadline…
    expect(outcome).toBe("DEFERRED");
    expect(waitedMs).toBeGreaterThanOrEqual(BUDGET_MS - 5);
    expect(waitedMs).toBeLessThan(SWEEP_MS / 2);
    // …while the sweep is still running, not cancelled…
    expect(sweepFinished).toBe(false);

    // …and was handed to the runtime to be kept alive, so it completes after
    // the response instead of being frozen with the instance.
    expect(kept).toHaveLength(1);
    await kept[0];
    expect(sweepFinished).toBe(true);
  });

  test("fast work is finished before the caller moves on, as before", async () => {
    const { kept, options } = harness(1_000);
    let done = false;

    const startedAt = Date.now();
    const outcome = await waitWithinBudget(async () => {
      await sleep(20);
      done = true;
    }, options);

    expect(outcome).toBe("FINISHED");
    expect(done).toBe(true);
    // It did not wait out the budget just because one was set.
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(kept).toHaveLength(1);
  });

  test("keep-alive is registered before the wait, not at the deadline", async () => {
    // Registering only once the budget ran out would be too late on serverless:
    // the registration has to exist while the request is still open.
    const order: string[] = [];

    await waitWithinBudget(
      async () => {
        order.push("work started");
        await sleep(10);
        order.push("work finished");
      },
      {
        budgetMs: 1_000,
        keepAlive: () => order.push("kept alive"),
        onError: () => {},
      },
    );

    expect(order).toEqual(["work started", "kept alive", "work finished"]);
  });

  test("work that fails never fails the caller", async () => {
    const { errors, kept, options } = harness(1_000);
    const failure = new Error("the database went away");

    await expect(
      waitWithinBudget(async () => {
        await sleep(5);
        throw failure;
      }, options),
    ).resolves.toBe("FINISHED");

    expect(errors).toEqual([failure]);
    // The promise handed to the runtime does not reject either.
    await expect(kept[0]).resolves.toBeUndefined();
  });

  test("work that throws synchronously is treated the same", async () => {
    const { errors, options } = harness(1_000);

    await expect(
      waitWithinBudget(() => {
        throw new Error("thrown before the first await");
      }, options),
    ).resolves.toBe("FINISHED");

    expect(errors).toHaveLength(1);
  });

  test("slow work that fails after the deadline is still reported, not thrown", async () => {
    const { errors, kept, options } = harness(30);

    const outcome = await waitWithinBudget(async () => {
      await sleep(150);
      throw new Error("late failure");
    }, options);

    expect(outcome).toBe("DEFERRED");
    expect(errors).toHaveLength(0);

    await kept[0];
    expect(errors).toHaveLength(1);
  });

  test("a keep-alive that throws does not fail the caller", async () => {
    const errors: unknown[] = [];

    await expect(
      waitWithinBudget(async () => {}, {
        budgetMs: 1_000,
        keepAlive: () => {
          throw new Error("after() is not available here");
        },
        onError: (error) => errors.push(error),
      }),
    ).resolves.toBe("FINISHED");

    expect(errors).toHaveLength(1);
  });
});

test.describe("every request-path match goes through the budget", () => {
  const read = (...segments: string[]) =>
    readFileSync(join(REPO, ...segments), "utf8");

  /** `await dispatch…(` with nothing between — an unbudgeted wait. */
  const UNBUDGETED = /^\s*await dispatch\w+\(/m;

  const CALLERS: [string, string[]][] = [
    [
      "driver status",
      ["src", "app", "api", "driver-profile", "status", "route.ts"],
    ],
    [
      "order completion",
      ["src", "app", "api", "orders", "[id]", "complete", "route.ts"],
    ],
    [
      "offer decline",
      [
        "src",
        "app",
        "api",
        "dashboard",
        "hub",
        "offers",
        "[id]",
        "decline",
        "route.ts",
      ],
    ],
  ];

  for (const [name, path] of CALLERS) {
    test(`${name} does not await matching directly`, () => {
      const source = read(...path);

      expect(source).toContain("runMatchingWithinBudget(");
      expect(source).not.toMatch(UNBUDGETED);
    });
  }

  test("payment settlement budgets offers and route alerts together", () => {
    const source = read("src", "lib", "orders", "payment-settlement.ts");
    const budgeted = source.slice(
      source.indexOf("await runMatchingWithinBudget("),
    );

    // Both inside the one budgeted block, offers first.
    expect(budgeted.indexOf("dispatchOffersForLoad(orderId)")).toBeGreaterThan(
      -1,
    );
    expect(
      budgeted.indexOf("dispatchRouteAlertsForLoad(orderId)"),
    ).toBeGreaterThan(budgeted.indexOf("dispatchOffersForLoad(orderId)"));
    expect(
      source.slice(0, source.indexOf("await runMatchingWithinBudget(")),
    ).not.toMatch(UNBUDGETED);
  });

  test("the budget is one second, kept alive with after()", () => {
    const source = read("src", "lib", "background", "request-budget.ts");

    expect(source).toContain("export const MATCHING_BUDGET_MS = 1_000;");
    expect(source).toContain("after(() => pending)");
  });

  test("the mechanism has no runtime imports", () => {
    expect(read("src", "lib", "background", "budget.ts")).not.toMatch(
      /^\s*import\s/m,
    );
  });
});
