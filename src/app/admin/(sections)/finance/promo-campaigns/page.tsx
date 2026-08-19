"use client";

import { useEffect, useState } from "react";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the table and the
// API drifting apart.
import type {
  AdminPromoCampaignListResponse,
  AdminPromoCampaignRow,
} from "@/app/api/admin/finance/promo-campaigns/route";
import {
  DISCOUNT_TYPE_LABELS,
  PromoCampaignFormDialog,
} from "@/components/admin/finance/promo-campaign-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Columns in the table, so the full-width state rows can span all of them. */
const COLUMN_COUNT = 6;

/**
 * Whole currency units with cents, matching how the rest of the back office
 * prints money. Hoisted so re-renders don't rebuild it per row.
 */
const amountFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * A percentage prints as the admin typed it — "25", not "25.00" — so up to two
 * decimals rather than exactly two.
 */
const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

/**
 * UTC, because the dialog writes each end of a campaign's window as a UTC
 * day — so the table shows the dates the campaign was saved with no matter
 * where the browser sits.
 */
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Which state a campaign's dialog is in, or null when none is open. */
type DialogState =
  { mode: "create" } | { mode: "edit"; campaign: AdminPromoCampaignRow };

/**
 * Pulls the API's `{ error }` message out of a failed response — a `403` for a
 * role that may not read this list, or a refused delete, says so instead of
 * showing the same "could not load" as a network failure.
 */
async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await response.json().catch(() => null);

  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

  return fallback;
}

/** "25%" or "$15.00", depending on which kind of discount the code carries. */
function formatDiscount(campaign: AdminPromoCampaignRow): string {
  return campaign.discountType === "PERCENTAGE"
    ? `${percentFormatter.format(campaign.discountValue)}%`
    : `$${amountFormatter.format(campaign.discountValue)}`;
}

/** "1 Jan 2026 – 31 Jan 2026", both ends inclusive. */
function formatWindow(campaign: AdminPromoCampaignRow): string {
  return `${dateFormatter.format(new Date(campaign.startsAt))} – ${dateFormatter.format(
    new Date(campaign.endsAt),
  )}`;
}

/**
 * `/admin/finance/promo-campaigns` — the discount codes staff author, with
 * their windows, caps and redemption counts.
 *
 * A client component reading the list endpoint rather than a server component
 * querying Prisma directly, because this page is mostly a write surface:
 * creating, editing and deactivating a campaign all have to put the table back
 * in step with the database, and one JSON refetch does that without
 * re-rendering the whole admin shell. The section layout above it already gates
 * *viewing*, and every endpoint re-checks the `adminRole` on each request,
 * which is the real boundary.
 *
 * Authoring only. Nothing here redeems a code or touches an order's price —
 * applying a discount at checkout is separate work, which is also why
 * `usedCount` is read-only on this page.
 */
export default function AdminPromoCampaignsPage() {
  const [items, setItems] = useState<AdminPromoCampaignRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  // Errors from a row action live apart from the load error: the table is still
  // valid and on screen, and only the action failed.
  const [actionError, setActionError] = useState<string | null>(null);
  // The campaign a row action is currently running against, so only that row's
  // buttons are disabled rather than the whole table.
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Bumped after any mutation, purely to re-run the fetch below so the table
  // shows the state the database now holds rather than a patched copy.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    async function load() {
      try {
        const response = await fetch("/api/admin/finance/promo-campaigns", {
          signal: controller.signal,
        });

        if (!response.ok) {
          setError(
            await readErrorMessage(response, "Could not load campaigns."),
          );
          setLoading(false);
          return;
        }

        const body = (await response.json()) as AdminPromoCampaignListResponse;
        setItems(body.items);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up, not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError("Could not load campaigns.");
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [reloadToken]);

  /** Both row actions refetch on success, so neither patches local state. */
  function handleMutated() {
    setDialogState(null);
    setReloadToken((token) => token + 1);
  }

  async function handleDeactivate(campaign: AdminPromoCampaignRow) {
    // Taking a live code out of circulation is one click away, so it is
    // confirmed; reactivating happens through the edit dialog, which is already
    // deliberate enough.
    if (
      !window.confirm(
        `Stop accepting ${campaign.code}? It can be reactivated later from Edit.`,
      )
    ) {
      return;
    }

    setActionError(null);
    setPendingId(campaign.id);

    try {
      const response = await fetch(
        `/api/admin/finance/promo-campaigns/${campaign.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: false }),
        },
      );

      if (!response.ok) {
        setActionError(
          await readErrorMessage(
            response,
            "Could not deactivate this campaign.",
          ),
        );
        return;
      }

      handleMutated();
    } catch {
      setActionError("Something went wrong. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(campaign: AdminPromoCampaignRow) {
    if (
      !window.confirm(
        `Permanently delete ${campaign.code}? This cannot be undone.`,
      )
    ) {
      return;
    }

    setActionError(null);
    setPendingId(campaign.id);

    try {
      const response = await fetch(
        `/api/admin/finance/promo-campaigns/${campaign.id}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        // A campaign that has been redeemed is refused here on purpose; the
        // route's message tells staff to deactivate it instead.
        setActionError(
          await readErrorMessage(response, "Could not delete this campaign."),
        );
        return;
      }

      handleMutated();
    } catch {
      setActionError("Something went wrong. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Discount codes clients redeem at checkout. A code applies only while
          it is active and inside its date window.
        </p>
        <Button size="sm" onClick={() => setDialogState({ mode: "create" })}>
          New Campaign
        </Button>
      </div>

      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Active window</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-destructive"
                >
                  <span role="alert">{error}</span>
                </TableCell>
              </TableRow>
            ) : loading && items === null ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  Loading campaigns…
                </TableCell>
              </TableRow>
            ) : items === null || items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  No promo campaigns yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((campaign) => {
                const busy = pendingId === campaign.id;

                return (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-mono font-medium">
                      {campaign.code}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{formatDiscount(campaign)}</span>
                        <span className="text-xs text-muted-foreground">
                          {DISCOUNT_TYPE_LABELS[campaign.discountType]}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{formatWindow(campaign)}</TableCell>
                    <TableCell>
                      {campaign.usedCount} /{" "}
                      {campaign.usageLimit === null
                        ? "Unlimited"
                        : campaign.usageLimit}
                    </TableCell>
                    <TableCell>
                      {campaign.isActive ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            setDialogState({ mode: "edit", campaign })
                          }
                        >
                          Edit
                        </Button>
                        {campaign.isActive ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => void handleDeactivate(campaign)}
                          >
                            Deactivate
                          </Button>
                        ) : null}
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleDelete(campaign)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {dialogState ? (
        <PromoCampaignFormDialog
          // Keyed by campaign so the form starts from the right values for each
          // one, without an effect to reset them.
          key={dialogState.mode === "edit" ? dialogState.campaign.id : "new"}
          campaign={dialogState.mode === "edit" ? dialogState.campaign : null}
          onClose={() => setDialogState(null)}
          onSaved={handleMutated}
        />
      ) : null}
    </div>
  );
}
