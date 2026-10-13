// Uses Next's `after()`, so it belongs to request handlers only.
import "server-only";

import { after } from "next/server";

import { waitWithinBudget, type BudgetOutcome } from "@/lib/background/budget";

/**
 * The longest a request may wait on offer and route-alert matching.
 *
 * Matching is normally a handful of indexed queries — tens of milliseconds —
 * so in the ordinary case the request waits for it and answers with the offer
 * already made, which is what lets a driver who has just gone online see their
 * offer on the very next read. One second is roughly ten times that: generous
 * enough that the ordinary case never trips it, small enough that a client
 * paying for an order, or a driver tapping "Delivered", is never held
 * noticeably by work that is not theirs.
 */
export const MATCHING_BUDGET_MS = 1_000;

/**
 * Runs matching work for a request **within a hard time budget**: waits for it
 * up to `MATCHING_BUDGET_MS`, then lets the request answer while the work
 * finishes after the response.
 *
 * ## Why a deadline *and* `after()`, rather than one of them
 *
 * There is no job queue, cron or socket on this stack, so matching rides on
 * the request that makes it necessary. Awaited outright, a slow sweep — a lock
 * wait on `LoadOffer`, a cold connection, a large candidate set — held the
 * client's checkout and the driver's completion for as long as it took.
 *
 * - **`after()` alone** would bound the wait at zero, but it changes what the
 *   response means: "you are online" would arrive before the offer exists, and
 *   an app that reads its offers straight afterwards would find none and have
 *   to poll. The work is fast almost always; there is no reason to make every
 *   request pay for the rare slow one.
 * - **A deadline alone** would release the request but, on serverless, leave
 *   the unfinished work to be frozen with the instance the moment the response
 *   is sent — an offer half-made.
 *
 * So: the work is registered with `after()` up front (which keeps the
 * invocation alive for it), and the request waits for it only up to the
 * deadline. Fast work is finished before the response, exactly as before; slow
 * work is finished after it. Either way the caller is held for at most the
 * budget, and the work is neither cancelled nor lost.
 *
 * Never throws. The `dispatch…` functions it is given already swallow their
 * own failures; anything that still escapes is logged here.
 */
export function runMatchingWithinBudget(
  work: () => Promise<void>,
): Promise<BudgetOutcome> {
  return waitWithinBudget(work, {
    budgetMs: MATCHING_BUDGET_MS,
    keepAlive: (pending) => {
      try {
        after(() => pending);
      } catch {
        // Outside a request (a script, a test) there is no response to outlive
        // and `after` throws. The work is already running; nothing to do.
      }
    },
    onError: (error) => {
      console.error("Matching failed after the request moved on:", error);
    },
  });
}
