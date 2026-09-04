"use client";

import * as React from "react";

import type { HubEarningsExportError } from "@/app/api/dashboard/hub/earnings/export/route";
import { Button } from "@/components/ui/button";

/**
 * The filter bar's **Export to Excel** control: it asks the server for the
 * workbook covering exactly the range on screen and hands the file to the
 * browser.
 *
 * A `fetch` rather than the plain `<a href>` the admin analytics page uses, for
 * one reason: a link gives no feedback. The workbook is built from a database
 * pass, so on a slow connection a link leaves the driver clicking a button that
 * appears to do nothing, and a failure lands as a browser error page in place
 * of the dashboard. Fetching lets the button say "Exporting…" while it waits
 * and print the reason inline when it fails — never an `alert()`, which is the
 * rule across this surface.
 *
 * The route re-resolves the range and re-queries the figures from the session's
 * own account; nothing about the file's contents is decided here.
 */

/** Where the workbook comes from. Same origin, so the cookie rides along. */
const EXPORT_ENDPOINT = "/api/dashboard/hub/earnings/export";

const GENERIC_ERROR = "Could not build the export. Try again.";
const NETWORK_ERROR = "Network error. Please check your connection.";

/**
 * How long the object URL is kept alive after the click.
 *
 * Revoking synchronously can cancel the download in some browsers, which start
 * reading the blob only after the click has been dispatched. Two seconds is the
 * margin the prototype uses and is comfortably past that.
 */
const REVOKE_DELAY_MS = 2000;

/** The 8px green square the design puts before the label. */
const GREEN_SQUARE_CLASSES =
  "size-2 rounded-[2px] bg-[oklch(59.6%_0.145_163.225)]";

export type EarningsExportButtonProps = {
  /** Resolved first day of the range, `YYYY-MM-DD`. */
  from: string;
  /** Resolved last day of the range, `YYYY-MM-DD`. */
  to: string;
};

export function EarningsExportButton({ from, to }: EarningsExportButtonProps) {
  const [exporting, setExporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleExport(): Promise<void> {
    setError(null);
    setExporting(true);

    try {
      const params = new URLSearchParams({ from, to });
      const response = await fetch(`${EXPORT_ENDPOINT}?${params.toString()}`);

      if (!response.ok) {
        // The route answers failures as JSON; a proxy or a crash may not, so
        // the parse is allowed to fail into the generic message.
        const payload = (await response
          .json()
          .catch(() => null)) as Partial<HubEarningsExportError> | null;

        setError(payload?.error ?? GENERIC_ERROR);
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = objectUrl;
      // Rebuilt from the same two params the request carried rather than parsed
      // out of `Content-Disposition`: both sides derive it from the resolved
      // range, so the strings agree, and one fewer header to parse is one fewer
      // way for the file to arrive named `download`.
      anchor.download = `earnings-${from}_${to}.xlsx`;
      // Appended before clicking: a detached anchor is ignored by Firefox.
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, REVOKE_DELAY_MS);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          void handleExport();
        }}
        disabled={exporting}
        aria-busy={exporting}
        className="h-auto gap-[7px] rounded-md px-[14px] py-2 text-[13px] font-medium"
      >
        <span aria-hidden="true" className={GREEN_SQUARE_CLASSES} />
        {exporting ? "Exporting…" : "Export to Excel"}
      </Button>

      {/* Inline, under the control that failed. */}
      {error ? (
        <p
          role="alert"
          className="max-w-[260px] text-right text-xs text-[oklch(44.4%_0.177_26.899)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
