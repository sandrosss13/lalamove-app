"use client";

import { useLoadsBoard } from "@/components/driver-hub/screens/loads-context";
import { formatGel } from "@/components/driver-hub/screens/loads-format";
import { Button } from "@/components/ui/button";

/**
 * **Placeholder. The real dialogs are task-12 (`task-12-claim-dialogs.md`):**
 * the claim-confirmation dialog and the lost-the-race dialog.
 *
 * Renders nothing when neither is open.
 *
 * **`data-admin-surface` on the outermost element is required.** This renders
 * as an overlay outside the shell's normal flow whether task-12 builds it as a
 * true Radix `DialogContent` (which portals to the document body) or keeps a
 * plain fixed div. Radix portals escape `DriverHubShell`'s root, and with it the
 * attribute that pins this surface to the light scheme — see the doc comment on
 * `driver-hub-shell.tsx`.
 *
 * ## The money rule, restated where it is easiest to break
 *
 * The confirm dialog's headline is "You are paid", and the figure beside it is
 * `HubLoad.driverPayout` — the driver's 85% share, resolved and stored at
 * booking. `Order.price` is what the *client* pays; it is not on `HubLoad`, it
 * is not in `GET /api/loads`'s response, and it must never reach this dialog.
 * Being wrong here is wrong in the driver's favour, which is the worst
 * direction: it sets an expectation the driver acts on and the platform then
 * has to walk back.
 *
 * ## What the context already gives task-12
 *
 * `dialogLoad` (the confirm target), `lostLoad` (`{ id, reference }` for the
 * race-loser copy, which names the load), `confirmClaim()`, `isClaiming` for
 * the button's disabled state, `claimError` — whose `code` is `"DRIVER_OFFLINE"`
 * when the remedy is the availability toggle in the header — and
 * `dismissClaimError()`. No new context state should be needed.
 *
 * **Takes no props, by contract.** task-12 rewrites the body of this file and
 * nothing else.
 */
export function LoadsClaimDialogs() {
  const { dialogLoad, lostLoad, closeConfirm, closeLost } = useLoadsBoard();

  if (dialogLoad === null && lostLoad === null) {
    return null;
  }

  const close = dialogLoad !== null ? closeConfirm : closeLost;

  return (
    <div
      data-admin-surface=""
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 text-sm">
        {dialogLoad !== null ? (
          <p>
            Claim dialog — coming soon. You are paid{" "}
            <span className="font-price tabular-nums">
              {formatGel(dialogLoad.driverPayout)}
            </span>
            .
          </p>
        ) : (
          <p>
            Lost-the-race dialog — coming soon (
            <span className="font-price tabular-nums">
              {lostLoad?.reference}
            </span>
            ).
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={close}
          className="mt-4"
        >
          Close
        </Button>
      </div>
    </div>
  );
}
