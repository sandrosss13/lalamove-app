"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the table and the
// API drifting apart.
import type {
  AdminPromoCampaignListResponse,
  AdminPromoCampaignRow,
} from "@/app/api/admin/finance/promo-campaigns/route";
import {
  DISCOUNT_TYPE_LABEL_KEYS,
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
const AMOUNT_FORMAT = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
} as const;

/**
 * A percentage prints as the admin typed it — "25", not "25.00" — so up to two
 * decimals rather than exactly two.
 */
const PERCENT_FORMAT = {
  maximumFractionDigits: 2,
} as const;

/**
 * UTC, because the dialog writes each end of a campaign's window as a UTC
 * day — so the table shows the dates the campaign was saved with no matter
 * where the browser sits.
 */
const WINDOW_DATE_FORMAT = {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
} as const;

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

/** "25%" or "₾15.00", depending on which kind of discount the code carries. */
/** The locale-aware formatter from `useFormatter()`, passed in from render. */
type Formatter = ReturnType<typeof useFormatter>;

function formatDiscount(
  campaign: AdminPromoCampaignRow,
  format: Formatter,
): string {
  return campaign.discountType === "PERCENTAGE"
    ? `${format.number(campaign.discountValue, PERCENT_FORMAT)}%`
    : `₾${format.number(campaign.discountValue, AMOUNT_FORMAT)}`;
}

/** "1 Jan 2026 – 31 Jan 2026", both ends inclusive. */
function formatWindow(
  campaign: AdminPromoCampaignRow,
  format: Formatter,
): string {
  return `${format.dateTime(new Date(campaign.startsAt), WINDOW_DATE_FORMAT)} – ${format.dateTime(
    new Date(campaign.endsAt),
    WINDOW_DATE_FORMAT,
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
  const t = useTranslations("admin.adminFinancePromoCampaigns");
  const tShared = useTranslations("common.shared");
  // "Unlimited" is the same word the campaign form dialog uses for an uncapped
  // campaign, so the table reads it from there rather than duplicating the key.
  const tForm = useTranslations("admin.promoCampaignFormDialog");
  const format = useFormatter();
  // Root-scoped: `DISCOUNT_TYPE_LABEL_KEYS` holds full message paths.
  const tRoot = useTranslations();
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
            await readErrorMessage(response, t("couldNotLoadCampaigns")),
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

        setError(t("couldNotLoadCampaigns"));
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [reloadToken, t]);

  /** Both row actions refetch on success, so neither patches local state. */
  function handleMutated() {
    setDialogState(null);
    setReloadToken((token) => token + 1);
  }

  async function handleDeactivate(campaign: AdminPromoCampaignRow) {
    // Taking a live code out of circulation is one click away, so it is
    // confirmed; reactivating happens through the edit dialog, which is already
    // deliberate enough.
    if (!window.confirm(t("confirmDeactivate", { code: campaign.code }))) {
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
          await readErrorMessage(response, t("couldNotDeactivateThisCampaign")),
        );
        return;
      }

      handleMutated();
    } catch {
      setActionError(tShared("somethingWentWrongPleaseTryAgain"));
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(campaign: AdminPromoCampaignRow) {
    if (!window.confirm(t("confirmDelete", { code: campaign.code }))) {
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
          await readErrorMessage(response, t("couldNotDeleteThisCampaign")),
        );
        return;
      }

      handleMutated();
    } catch {
      setActionError(tShared("somethingWentWrongPleaseTryAgain"));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("discountCodesClientsRedeemAtCheckout")}
        </p>
        <Button size="sm" onClick={() => setDialogState({ mode: "create" })}>
          {t("newCampaign")}
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
              <TableHead>{tShared("code")}</TableHead>
              <TableHead>{t("discount")}</TableHead>
              <TableHead>{tShared("activeWindow")}</TableHead>
              <TableHead>{t("usage")}</TableHead>
              <TableHead>{tShared("status")}</TableHead>
              <TableHead className="text-right">{tShared("actions")}</TableHead>
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
                  {t("loadingCampaigns")}
                </TableCell>
              </TableRow>
            ) : items === null || items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  {t("noPromoCampaignsYet")}
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
                        <span>{formatDiscount(campaign, format)}</span>
                        <span className="text-xs text-muted-foreground">
                          {tRoot(
                            DISCOUNT_TYPE_LABEL_KEYS[campaign.discountType],
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{formatWindow(campaign, format)}</TableCell>
                    <TableCell>
                      {campaign.usedCount} /{" "}
                      {campaign.usageLimit === null
                        ? tForm("unlimited")
                        : campaign.usageLimit}
                    </TableCell>
                    <TableCell>
                      {campaign.isActive ? (
                        <Badge variant="secondary">{tShared("active")}</Badge>
                      ) : (
                        <Badge variant="outline">{tShared("inactive")}</Badge>
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
                          {tShared("edit")}
                        </Button>
                        {campaign.isActive ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => void handleDeactivate(campaign)}
                          >
                            {t("deactivate")}
                          </Button>
                        ) : null}
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleDelete(campaign)}
                        >
                          {tShared("delete")}
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
