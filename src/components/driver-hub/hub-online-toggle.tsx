"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

/** The endpoint that owns `DriverProfile.isOnline`. */
const STATUS_ENDPOINT = "/api/driver-profile/status";

const GENERIC_ERROR = "Could not update your online status.";
const NETWORK_ERROR = "Network error. Please check your connection.";

/** Why the pill is disabled. Mirrors the 403 the endpoint returns. */
const NOT_ACTIVATED_TITLE =
  "Your account isn't approved yet. Finish onboarding to go online.";

export type HubOnlineToggleProps = {
  /** Current availability, from `resolveHubAccount()`. */
  isOnline: boolean;
  /** Whether this driver is activated and may therefore *go* online. */
  canToggleOnline: boolean;
};

/**
 * The header's availability pill: a 7px status dot plus "Online"/"Offline".
 *
 * Deliberately a plain `<button>` rather than a `Button` variant — the design's
 * pill is a fully-round 99px shape with its own padding, border and two colour
 * pairs, so it would be an override of every part of the variant it used.
 *
 * The mutation is the one the retired `DriverStatusToggle` established: the same
 * `PATCH` body (`{ isOnline }`), the same `{ error }` / `{ isOnline }` response
 * reading, and the same rule that the server's answer wins.
 *
 * ---------------------------------------------------------------------------
 * KNOWN GAP — the driver location beacon has no home. Re-home it before relying
 * on live driver positions.
 *
 * The old `src/components/driver-status-toggle.tsx` did two things this pill
 * deliberately does not, and it was deleted with the ops console (last present
 * at commit 7964f98; `git show 7964f98:src/components/driver-status-toggle.tsx`
 * is the full implementation):
 *
 *   1. It gated *going online* on an actual `navigator.geolocation` fix taken
 *      before the status PATCH, so a driver could never be marked online
 *      server-side while sharing no position. A denied or timed-out permission
 *      left them offline with "Location access is required to go online."
 *   2. While online it ran a beacon: `POST /api/driver-profile/location` with
 *      `{ lat, lng }`, fired once immediately and then every 15s from an effect
 *      keyed on `isOnline`, torn down on going offline or unmounting. A failed
 *      ping surfaced as a non-blocking warning, not an error.
 *
 * `/api/driver-profile/location` is still live and still has no other caller,
 * so `DriverProfile`'s stored position now only goes stale — nothing in the app
 * writes it. This pill is the wrong owner for a background side effect with its
 * own permission prompt and lifecycle, which is why the beacon was not folded
 * in here rather than being reinstated in a hurry. Whoever re-homes it should
 * put it in the hub shell or a dedicated provider, where its lifetime is the
 * session rather than one header control.
 * ---------------------------------------------------------------------------
 *
 * Success refreshes the route instead of flipping local state, so the pill, the
 * Today screen and anything else reading `isOnline` all move together off one
 * server read — there is no second source of truth to drift.
 */
export function HubOnlineToggle({
  isOnline,
  canToggleOnline,
}: HubOnlineToggleProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `router.refresh()` is fire-and-forget on its own; a transition is what
  // makes "the server has not answered yet" observable, so the pill stays
  // disabled until the fresh `isOnline` actually arrives.
  const [refreshing, startTransition] = useTransition();

  // Going *offline* is never gated — the endpoint allows it regardless of
  // activation precisely so a driver deactivated mid-shift cannot get stuck
  // marked online. Disabling on `!canToggleOnline` alone would re-introduce
  // exactly that trap, so an already-online driver keeps a working control.
  const disabled = !canToggleOnline && !isOnline;
  const busy = submitting || refreshing;

  async function handleToggle() {
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(STATUS_ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOnline: !isOnline }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        // The endpoint's own message is more useful than ours ("Complete your
        // driver profile…", "Your account isn't approved yet…").
        setError(payload?.error ?? GENERIC_ERROR);
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  const label = isOnline ? "Online" : "Offline";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          void handleToggle();
        }}
        disabled={disabled || busy}
        // `aria-pressed` states the toggle's value; the visible label already
        // reads "Online"/"Offline", so the two agree rather than conflict.
        aria-pressed={isOnline}
        title={disabled ? NOT_ACTIVATED_TITLE : undefined}
        className={cn(
          // Geometry is the design's `onlineBtnStyle` verbatim: `padding:'5px
          // 12px'`, `fontSize:12`, `fontWeight:600`, `gap:9`, `borderRadius:99`.
          "flex cursor-pointer items-center gap-[9px] rounded-full border px-3 py-[5px] text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          // Online is the hub's `success` tone, and it carries the same
          // hand-written `dark:` half as every other pill on the surface —
          // quoted verbatim from `HUB_STATUS_TONE_CLASSES` in `hub-status.ts`
          // rather than re-picked here, so "Online" in this bar and an "Online"
          // status pill on a screen below it stay the same green in both
          // themes. Border and background are the same value on purpose: the
          // design draws the pill as one flat tinted block, not a bordered one.
          //
          // Offline needs no `dark:` half at all — it is already three tokens,
          // and `bg-background` against the bar's own `bg-background` gives it
          // the design's "white pill on a white header, found by its border"
          // reading in light and the identical relationship in dark.
          isOnline
            ? "border-[oklch(96.2%_0.044_156.743)] bg-[oklch(96.2%_0.044_156.743)] text-[oklch(44.8%_0.119_151.328)] dark:border-[oklch(27%_0.05_156.743)] dark:bg-[oklch(27%_0.05_156.743)] dark:text-[oklch(84%_0.13_156.743)]"
            : "border-border bg-background text-muted-foreground",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            // `onlineDotStyle` is `{ width: 7, height: 7 }` — not the 8px a
            // `size-2` would give.
            //
            // The live dot's green is the one hub colour with no `dark:` half
            // and no token: at 59.6% lightness it is a mid-green that carries
            // on both the light tint above and its dark counterpart, and a dot
            // that changed hue with the theme would be the one element in the
            // bar claiming the driver's availability means something different
            // after dark.
            "size-[7px] rounded-full",
            isOnline
              ? "bg-[oklch(59.6%_0.145_163.225)]"
              : "bg-muted-foreground",
          )}
        />
        {busy ? "Updating…" : label}
      </button>

      {/* Inline rather than an `alert()`: the failure belongs next to the
          control that caused it, and a modal would block the whole hub over a
          transient network blip.

          `text-destructive` rather than the handoff's `oklch(44.4% 0.177
          26.899)`, which this line used to spell out. That literal is the
          *pill* red — the foreground `hub-status.ts` pairs with a pale danger
          wash — and it was never right on the bar's own background even in
          light mode; on a dark one it is a near-black line of text in a
          near-black header. The token is already the design's error red in
          both themes (`oklch(0.577 0.245 27.325)` light, `oklch(0.704 0.191
          22.216)` dark) and is what every other error line on this surface now
          uses, so a failed availability flip reads the same as a failed form
          submit. */}
      {error ? (
        <p
          role="alert"
          className="max-w-[220px] text-right text-[11px] text-destructive"
        >
          {error}
        </p>
      ) : null}

      {disabled ? (
        // `title` is not reliably announced, so the reason is also real text
        // for assistive tech — the same approach `<SampleNote />` takes.
        <span className="sr-only">{NOT_ACTIVATED_TITLE}</span>
      ) : null}
    </div>
  );
}
