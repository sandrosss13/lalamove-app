"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import type { WithdrawalStatus } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time.
import type {
  AdminWithdrawalListResponse,
  AdminWithdrawalRow,
} from "@/app/api/admin/finance/withdrawals/route";
import { APPLICATION_STATUS_CHIP_CLASSES } from "@/components/admin/application-status-colors";
import { WalletActionDialog } from "@/components/admin/finance/wallet-action-dialog";
import {
  formatTetri,
  groupIban,
} from "@/components/admin/finance/wallet-format";
import { readErrorMessage } from "@/components/admin/read-error-message";
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
import {
  MAX_BANK_REFERENCE_LENGTH,
  MAX_WALLET_REASON_LENGTH,
} from "@/lib/wallet/rules";

/** Columns in the table, so the full-width state rows can span all of them. */
const COLUMN_COUNT = 6;

/**
 * The filter pills. `"ALL"` is this page's own value — the absence of a
 * `?status=` param. The page opens on `PENDING`: what is waiting to be paid.
 */
type WithdrawalFilter = WithdrawalStatus | "ALL";

const FILTER_ORDER: readonly WithdrawalFilter[] = [
  "PENDING",
  "PAID",
  "REJECTED",
  "REVERSED",
  "ALL",
];

/** Each pill's label and the copy shown when that filter matches nothing. */
const FILTERS: Record<
  WithdrawalFilter,
  { labelKey: string; emptyKey: string }
> = {
  PENDING: {
    labelKey: "admin.adminWallet.statusPending",
    emptyKey: "admin.adminWallet.emptyWithdrawalsPending",
  },
  PAID: {
    labelKey: "admin.adminWallet.statusPaid",
    emptyKey: "admin.adminWallet.emptyWithdrawalsPaid",
  },
  REJECTED: {
    labelKey: "admin.adminWallet.statusRejected",
    emptyKey: "admin.adminWallet.emptyWithdrawalsRejected",
  },
  REVERSED: {
    labelKey: "admin.adminWallet.statusReversed",
    emptyKey: "admin.adminWallet.emptyWithdrawalsReversed",
  },
  ALL: {
    labelKey: "common.shared.all",
    emptyKey: "admin.adminWallet.emptyWithdrawalsAll",
  },
};

const STATUS_CHIP_CLASSES: Record<WithdrawalStatus, string> = {
  PENDING: APPLICATION_STATUS_CHIP_CLASSES.PENDING,
  PAID: APPLICATION_STATUS_CHIP_CLASSES.APPROVED,
  REJECTED: APPLICATION_STATUS_CHIP_CLASSES.ACTION_REQUIRED,
  REVERSED: APPLICATION_STATUS_CHIP_CLASSES.ACTION_REQUIRED,
};

/** Which decision the open dialog is collecting, and for which withdrawal. */
type OpenAction = {
  action: "pay" | "reject" | "reverse";
  withdrawal: AdminWithdrawalRow;
};

/**
 * `/admin/finance/withdrawals` — drivers' withdrawal requests. Staff make the
 * bank transfer outside this system and record the outcome here: paid, with
 * the bank's reference; rejected, with a reason, which frees the amount; or —
 * for a paid transfer the bank returned — reversed.
 *
 * A client component reading the list endpoint, matching the other admin
 * listings. The section layout gates *viewing*; the endpoints re-check the
 * `adminRole` on every request, which is the real boundary.
 */
export default function AdminWithdrawalsPage() {
  const t = useTranslations("admin.adminWallet");
  const tShared = useTranslations("common.shared");
  const tRoot = useTranslations();
  const format = useFormatter();
  const [filter, setFilter] = useState<WithdrawalFilter>("PENDING");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminWithdrawalListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenAction | null>(null);
  // Bumped after a decision, purely to re-run the fetch below.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ page: String(page) });
    if (filter !== "ALL") {
      params.set("status", filter);
    }

    async function load() {
      try {
        const response = await fetch(
          `/api/admin/finance/withdrawals?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setError(
            await readErrorMessage(response, t("couldNotLoadWithdrawals")),
          );
          setLoading(false);
          return;
        }

        setData((await response.json()) as AdminWithdrawalListResponse);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up, not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError(t("couldNotLoadWithdrawals"));
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [filter, page, reloadToken, t]);

  const items = data?.items ?? [];

  /** The line under a decided withdrawal's status chip. */
  function statusNote(withdrawal: AdminWithdrawalRow): string | null {
    if (withdrawal.status === "REJECTED") {
      return withdrawal.rejectionReason;
    }

    if (withdrawal.status === "REVERSED") {
      return withdrawal.reversalReason;
    }

    return withdrawal.bankReference === null
      ? null
      : t("bankReferenceValue", { reference: withdrawal.bankReference });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_ORDER.map((candidate) => {
            const active = candidate === filter;

            return (
              <Button
                key={candidate}
                type="button"
                size="sm"
                variant={active ? "secondary" : "outline"}
                aria-pressed={active}
                onClick={() => {
                  setFilter(candidate);
                  // Page 3 of the previous filter says nothing about this one.
                  setPage(1);
                }}
              >
                {tRoot(FILTERS[candidate].labelKey)}
              </Button>
            );
          })}
        </div>
        {data ? (
          <p className="text-sm text-muted-foreground">
            {t("withdrawalCount", { count: data.total })} ·{" "}
            {t("pendingSummary", {
              count: data.pendingCount,
              total: formatTetri(format, data.pendingTotalTetri),
            })}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tShared("driver")}</TableHead>
              <TableHead>{t("amount")}</TableHead>
              <TableHead>{t("destination")}</TableHead>
              <TableHead>{t("requested")}</TableHead>
              <TableHead>{tShared("status")}</TableHead>
              <TableHead>{tShared("actions")}</TableHead>
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
            ) : loading && data === null ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  {t("loadingWithdrawals")}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  {tRoot(FILTERS[filter].emptyKey)}
                </TableCell>
              </TableRow>
            ) : (
              items.map((withdrawal) => {
                const note = statusNote(withdrawal);

                return (
                  <TableRow key={withdrawal.withdrawalId}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {withdrawal.driver.name}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {withdrawal.driver.phone}
                        </span>
                        {withdrawal.driver.isSuspended ? (
                          <span className="text-xs text-destructive">
                            {t("suspended")}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono font-medium">
                      {formatTetri(format, withdrawal.amountTetri)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{withdrawal.accountHolderName}</span>
                        <span className="text-xs text-muted-foreground">
                          {withdrawal.bankName}
                        </span>
                        <span className="font-mono text-xs">
                          {groupIban(withdrawal.iban)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {format.dateTime(new Date(withdrawal.requestedAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell className="max-w-[16rem]">
                      <div className="flex flex-col items-start gap-1">
                        <Badge
                          className={STATUS_CHIP_CLASSES[withdrawal.status]}
                        >
                          {tRoot(FILTERS[withdrawal.status].labelKey)}
                        </Badge>
                        {note === null ? null : (
                          <span className="text-xs whitespace-normal text-muted-foreground">
                            {note}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {withdrawal.status === "PENDING" ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                setOpen({ action: "pay", withdrawal })
                              }
                            >
                              {t("markPaid")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setOpen({ action: "reject", withdrawal })
                              }
                            >
                              {tShared("reject")}
                            </Button>
                          </>
                        ) : withdrawal.status === "PAID" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setOpen({ action: "reverse", withdrawal })
                            }
                          >
                            {t("reverse")}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.pageCount > 1 ? (
        <div className="flex items-center justify-end gap-3">
          <span className="text-sm text-muted-foreground">
            {tShared("pageOf", {
              page: data.page,
              pageCount: data.pageCount,
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || data.page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {tShared("previous")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || data.page >= data.pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            {tShared("next")}
          </Button>
        </div>
      ) : null}

      {open ? (
        <WalletActionDialog
          key={`${open.action}-${open.withdrawal.withdrawalId}`}
          title={
            open.action === "pay"
              ? t("markPaidTitle")
              : open.action === "reject"
                ? t("rejectWithdrawalTitle")
                : t("reverseTitle")
          }
          description={t(
            open.action === "pay"
              ? "markPaidDescription"
              : open.action === "reject"
                ? "rejectWithdrawalDescription"
                : "reverseDescription",
            {
              amount: formatTetri(format, open.withdrawal.amountTetri),
              holder: open.withdrawal.accountHolderName,
              iban: groupIban(open.withdrawal.iban),
            },
          )}
          fieldLabel={
            open.action === "pay" ? t("bankReference") : tShared("reason")
          }
          fieldHint={
            open.action === "reject" ? t("reasonShownToDriver") : undefined
          }
          multiline={open.action !== "pay"}
          maxLength={
            open.action === "pay"
              ? MAX_BANK_REFERENCE_LENGTH
              : MAX_WALLET_REASON_LENGTH
          }
          confirmLabel={
            open.action === "pay"
              ? t("markPaid")
              : open.action === "reject"
                ? tShared("reject")
                : t("reverse")
          }
          destructive={open.action !== "pay"}
          fallbackError={t("couldNotSaveDecision")}
          buildRequest={(text) => ({
            url: `/api/admin/finance/withdrawals/${open.withdrawal.withdrawalId}`,
            body:
              open.action === "pay"
                ? { action: "pay", bankReference: text }
                : { action: open.action, reason: text },
          })}
          onClose={() => setOpen(null)}
          onDone={() => setReloadToken((token) => token + 1)}
        />
      ) : null}
    </div>
  );
}
