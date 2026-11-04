/**
 * Runs `work` after the response has been sent, through Next's `after()`, for
 * every email the app sends from inside a request (password reset, the client
 * order emails).
 *
 * `after()` keeps the function alive on Vercel until `work` finishes, so a
 * Resend round trip never holds the caller's response open. Outside a Next
 * request scope (a direct server-side call, a script) it throws, and `work` is
 * simply awaited.
 *
 * Errors end here, logged under `logLabel` — the caller has already answered,
 * and a failed email must never become a different answer. `logLabel` is the
 * whole log line before the error (e.g. `"[password-reset] email not
 * delivered:"`); callers keep addresses out of it.
 *
 * `next/server` is imported lazily so a module that imports this one still
 * loads under a plain Node runner (`tsx` scripts, pure specs).
 */
export async function runAfterResponse(
  work: () => Promise<void>,
  logLabel: string,
): Promise<void> {
  const run = () =>
    work().catch((error: unknown) => {
      console.error(logLabel, error);
    });

  try {
    const { after } = await import("next/server");
    after(run);
  } catch {
    await run();
  }
}
