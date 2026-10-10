/**
 * A hard time budget for work a request starts but must not wait on — with
 * nothing else attached.
 *
 * Deliberately free of runtime imports (no `server-only`, no Next), so
 * `tests/request-budget.spec.ts` can prove the one property that matters — a
 * slow piece of work does not delay its caller past the budget — with a fake
 * clock-free, database-free piece of work. `./request-budget.ts` is the half
 * that knows about Next's `after()`.
 */

/** How the wait ended. */
export type BudgetOutcome =
  /** The work settled inside the budget; the caller waited only that long. */
  | "FINISHED"
  /**
   * The budget ran out first. The caller is released **now**; the work has not
   * been cancelled and carries on in the background, kept alive by whatever
   * `keepAlive` was given.
   */
  | "DEFERRED";

/**
 * Starts `work` and waits for it — but never longer than `budgetMs`.
 *
 * - `work` is started immediately and exactly once.
 * - `keepAlive` is handed the work's promise **before** the wait begins, so the
 *   runtime is told to keep the invocation alive for it whether or not the
 *   budget runs out. On serverless that is the difference between "finishes
 *   after the response" and "frozen mid-query when the response is sent".
 * - The returned promise **never rejects** and never takes longer than
 *   `budgetMs` (plus scheduling): a failure in `work` is reported to
 *   `onError` and counts as finished.
 *
 * The work is not cancelled at the deadline, on purpose. It is a handful of
 * database statements that are safe to complete late (idempotent inserts
 * behind unique indexes); abandoning them halfway would save nothing and could
 * leave a driver un-offered. The deadline bounds the *caller's wait*, which is
 * the thing a client's checkout or a driver's tap is exposed to.
 */
export async function waitWithinBudget(
  work: () => Promise<void>,
  options: {
    budgetMs: number;
    keepAlive: (pending: Promise<void>) => void;
    onError: (error: unknown) => void;
  },
): Promise<BudgetOutcome> {
  const { budgetMs, keepAlive, onError } = options;

  // Wrapped so a synchronous throw from `work` is caught like a rejection, and
  // so the promise handed to `keepAlive` can never reject unhandled.
  const pending: Promise<void> = (async () => {
    try {
      await work();
    } catch (error) {
      onError(error);
    }
  })();

  try {
    keepAlive(pending);
  } catch (error) {
    // Failing to register the keep-alive must not fail the request either; the
    // work is already running and will finish if the process lives.
    onError(error);
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<BudgetOutcome>((resolve) => {
    timer = setTimeout(() => resolve("DEFERRED"), budgetMs);
  });

  try {
    return await Promise.race([
      pending.then((): BudgetOutcome => "FINISHED"),
      deadline,
    ]);
  } finally {
    // Otherwise a finished request would keep a live timer for `budgetMs`.
    clearTimeout(timer);
  }
}
