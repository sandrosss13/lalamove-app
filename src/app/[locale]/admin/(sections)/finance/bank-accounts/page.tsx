"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import type { BankAccountStatus, DriverAccountType } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time.
import type {
  AdminBankAccountListResponse,
  AdminBankAccountRow,
} from "@/app/api/admin/finance/bank-accounts/route";
import { APPLICATION_STATUS_CHIP_CLASSES } from "@/components/admin/application-status-colors";
import { WalletActionDialog } from "@/components/admin/finance/wallet-action-dialog";
import { groupIban } from "@/components/admin/finance/wallet-format";
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
import { MAX_WALLET_REASON_LENGTH } from "@/lib/wallet/rules";

/** Columns in the table, so the full-width state rows can span all of them. */
const COLUMN_COUNT = 6;

/**
 * The filter pills. `"ALL"` is this page's own value — the absence of a
 * `?status=` param. The page opens on `PENDING`: the queue is the work.
 */
type AccountFilter = BankAccountStatus | "ALL";

const FILTER_ORDER: readonly AccountFilter[] = [
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "ALL",
];

/** Each pill's label and the copy shown when that filter matches nothing. */
const FILTERS: Record<AccountFilter, { labelKey: string; emptyKey: string }> = {
  PENDING: {
    labelKey: "admin.adminWallet.statusPending",
    emptyKey: "admin.adminWallet.emptyBankPending",
  },
  VERIFIED: {
    labelKey: "admin.adminWallet.statusVerified",
    emptyKey: "admin.adminWallet.emptyBankVerified",
  },
  REJECTED: {
    labelKey: "admin.adminWallet.statusRejected",
    emptyKey: "admin.adminWallet.emptyBankRejected",
  },
  ALL: {
    labelKey: "common.shared.all",
    emptyKey: "admin.adminWallet.emptyBankAll",
  },
};

/** The three verdicts on the application palette: pending, approved, refused. */
const STATUS_CHIP_CLASSES: Record<BankAccountStatus, string> = {
  PENDING: APPLICATION_STATUS_CHIP_CLASSES.PENDING,
  VERIFIED: APPLICATION_STATUS_CHIP_CLASSES.APPROVED,
  REJECTED: APPLICATION_STATUS_CHIP_CLASSES.ACTION_REQUIRED,
};

const ACCOUNT_TYPE_LABEL_KEYS: Record<DriverAccountType, string> = {
  INDIVIDUAL: "admin.adminWallet.accountTypeIndividual",
  INDIVIDUAL_ENTREPRENEUR:
    "admin.adminWallet.accountTypeIndividualEntrepreneur",
  BUSINESS: "admin.adminWallet.accountTypeBusiness",
};

/**
 * `/admin/finance/bank-accounts` — the verification queue for the bank
 * accounts drivers want withdrawals paid to. Each row puts the IBAN beside
 * what it has to match — the driver's legal name, ID number and account type —
 * with the two verdicts: verify, or reject with a reason.
 *
 * A client component reading the list endpoint, matching the other admin
 * listings. The section layout gates *viewing*; the endpoints re-check the
 * `adminRole` on every request, which is the real boundary.
 */
export default function AdminBankAccountsPage() {
  const t = useTranslations("admin.adminWallet");
  const tShared = useTranslations("common.shared");
  const tRoot = useTranslations();
  const format = useFormatter();
  const [filter, setFilter] = useState<AccountFilter>("PENDING");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminBankAccountListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<AdminBankAccountRow | null>(null);
  // Bumped after a verdict, purely to re-run the fetch below so the table
  // shows what the database now holds rather than a patched copy.
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
          `/api/admin/finance/bank-accounts?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setError(
            await readErrorMessage(response, t("couldNotLoadBankAccounts")),
          );
          setLoading(false);
          return;
        }

        setData((await response.json()) as AdminBankAccountListResponse);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up, not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError(t("couldNotLoadBankAccounts"));
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [filter, page, reloadToken, t]);

  async function verify(accountId: string) {
    setVerifyingId(accountId);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/admin/finance/bank-accounts/${accountId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify" }),
        },
      );

      if (!response.ok) {
        setActionError(
          await readErrorMessage(response, t("couldNotSaveDecision")),
        );
      } else {
        setReloadToken((token) => token + 1);
      }
    } catch {
      setActionError(t("couldNotSaveDecision"));
    }

    setVerifyingId(null);
  }

  const items = data?.items ?? [];

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
            {t("accountCount", { count: data.total })} ·{" "}
            {t("waitingCount", { count: data.pendingCount })}
          </p>
        ) : null}
      </div>

      {actionError !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tShared("driver")}</TableHead>
              <TableHead>{t("identity")}</TableHead>
              <TableHead>{t("bankAccount")}</TableHead>
              <TableHead>{t("added")}</TableHead>
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
                  {t("loadingBankAccounts")}
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
              items.map((account) => (
                <TableRow key={account.accountId}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{account.driver.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {account.driver.phone}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>
                        {account.driver.legalName ?? t("noLegalName")}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {account.driver.idNumber === null
                          ? t("noIdNumber")
                          : t("idNumber", {
                              idNumber: account.driver.idNumber,
                            })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {tRoot(
                          ACCOUNT_TYPE_LABEL_KEYS[account.driver.accountType],
                        )}
                      </span>
                      {account.driver.isRoster ? (
                        <span className="text-xs text-destructive">
                          {t("rosterNoWallet")}
                        </span>
                      ) : account.driver.isActivated ? null : (
                        <span className="text-xs text-destructive">
                          {t("notActivated")}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>
                        {account.bankName}
                        {account.isDefault ? ` · ${t("defaultAccount")}` : null}
                      </span>
                      <span className="font-mono text-xs">
                        {groupIban(account.iban)}
                      </span>
                      {account.sameIbanOnOtherDrivers > 0 ? (
                        <span className="text-xs text-destructive">
                          {t("sameIbanWarning", {
                            count: account.sameIbanOnOtherDrivers,
                          })}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {format.dateTime(new Date(account.createdAt), {
                      dateStyle: "medium",
                    })}
                  </TableCell>
                  <TableCell className="max-w-[16rem]">
                    <div className="flex flex-col items-start gap-1">
                      <Badge className={STATUS_CHIP_CLASSES[account.status]}>
                        {tRoot(FILTERS[account.status].labelKey)}
                      </Badge>
                      {account.rejectionReason === null ? null : (
                        <span className="text-xs whitespace-normal text-muted-foreground">
                          {account.rejectionReason}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {account.status === "VERIFIED" ? null : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={verifyingId !== null}
                          onClick={() => void verify(account.accountId)}
                        >
                          {verifyingId === account.accountId
                            ? tShared("saving")
                            : t("verify")}
                        </Button>
                      )}
                      {account.status === "REJECTED" ? null : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={verifyingId !== null}
                          onClick={() => setRejecting(account)}
                        >
                          {tShared("reject")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
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

      {rejecting ? (
        <WalletActionDialog
          title={t("rejectAccountTitle")}
          description={`${rejecting.driver.name} — ${rejecting.bankName} · ${groupIban(rejecting.iban)}`}
          fieldLabel={tShared("reason")}
          fieldHint={t("reasonShownToDriver")}
          multiline
          maxLength={MAX_WALLET_REASON_LENGTH}
          confirmLabel={tShared("reject")}
          destructive
          fallbackError={t("couldNotSaveDecision")}
          buildRequest={(reason) => ({
            url: `/api/admin/finance/bank-accounts/${rejecting.accountId}`,
            body: { action: "reject", reason },
          })}
          onClose={() => setRejecting(null)}
          onDone={() => setReloadToken((token) => token + 1)}
        />
      ) : null}
    </div>
  );
}
