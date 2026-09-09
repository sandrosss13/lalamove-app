import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The read-only counterpart to a form field, used by every panel on the account
 * screen that shows a fact the app cannot change.
 *
 * A `<dl>` rather than a grid of disabled inputs. A disabled input says "this
 * is a control you may not use right now"; these values are not controls at
 * all, and there is no state of the app in which they become editable here. The
 * profile form keeps disabled inputs for the two fields that sit *inside* a
 * form and would otherwise leave a visible hole in its grid — the distinction
 * is whether the value is part of something being edited.
 *
 * A server component: it holds no state and takes no handlers, so it stays out
 * of the client bundle even though its callers may be rendered from either
 * side.
 */

export type DriverAccountDetailRow = {
  /** The muted label, e.g. "Bank". */
  label: string;
  /** The value. `null` renders the empty marker rather than a blank line. */
  value: React.ReactNode;
  /** Renders the value in IBM Plex Mono — ids, numbers, IBANs, plates. */
  mono?: boolean;
  /** A muted line under the value, e.g. why it cannot be changed here. */
  note?: React.ReactNode;
};

/** Printed where a record holds no value, so a row is never visibly blank. */
export const DETAIL_EMPTY_VALUE = "Not recorded";

export function DriverAccountDetailList({
  rows,
  className,
}: {
  rows: readonly DriverAccountDetailRow[];
  className?: string;
}) {
  return (
    <dl className={cn("grid min-w-0 gap-3.5 sm:grid-cols-2", className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">
            {row.label}
          </dt>
          <dd
            className={cn(
              "text-sm break-words",
              row.mono ? "font-price" : null,
              row.value === null ? "text-muted-foreground" : null,
            )}
          >
            {row.value ?? DETAIL_EMPTY_VALUE}
          </dd>
          {row.note ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {row.note}
            </p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
