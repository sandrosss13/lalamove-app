"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import type { WalletEntryType } from "@prisma/client";

// Type-only imports, so nothing of the server routes is pulled into this
// client bundle — they are erased at compile time.
import type { AdminWalletDetail } from "@/app/api/admin/finance/wallets/[driverProfileId]/route";
import {
  formatSignedTetri,
  formatTetri,
} from "@/components/admin/finance/wallet-format";
import { readErrorMessage } from "@/components/admin/read-error-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MAX_WALLET_REASON_LENGTH } from "@/lib/wallet/rules";

/** Message path of each ledger entry type's name. */
const ENTRY_TYPE_LABEL_KEYS: Record<WalletEntryType, string> = {
  JOB_PAYOUT: "admin.adminWallet.entryJobPayout",
  JOB_OVERTIME: "admin.adminWallet.entryJobOvertime",
  WITHDRAWAL: "admin.adminWallet.entryWithdrawal",
  WITHDRAWAL_REVERSAL: "admin.adminWallet.entryWithdrawalReversal",
  ADJUSTMENT: "admin.adminWallet.entryAdjustment",
};

/** A lari amount as typed: digits, optionally a point and up to two more. */
const LARI_INPUT_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * "12.5" → 1250, without ever multiplying a Float: the two halves are read as
 * integers. `null` when the text is not a positive lari amount.
 */
function lariTextToTetri(text: string): number | null {
  const trimmed = text.trim();

  if (!LARI_INPUT_PATTERN.test(trimmed)) {
    return null;
  }

  const [whole = "0", fraction = ""] = trimmed.split(".");
  const tetri = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  return tetri > 0 ? tetri : null;
}

/**
 * One driver's wallet: the three balance figures, the ledger newest first, and
 * the manual adjustment form.
 *
 * The form is shown to every reader of this page, and the server decides who
 * may post: adjustments are super-admin only, so a finance manager who tries
 * is told so by the API's own message. The hint says as much up front.
 */
export function WalletLedgerDialog({
  driverProfileId,
  onClose,
  onChanged,
}: {
  driverProfileId: string;
  onClose: () => void;
  /** Called after an adjustment is posted, so the list behind can re-fetch. */
  onChanged: () => void;
}) {
  const t = useTranslations("admin.adminWallet");
  const tShared = useTranslations("common.shared");
  const tRoot = useTranslations();
  const format = useFormatter();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminWalletDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(
          `/api/admin/finance/wallets/${driverProfileId}?page=${page}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setLoadError(
            await readErrorMessage(response, t("couldNotLoadLedger")),
          );
          return;
        }

        setData((await response.json()) as AdminWalletDetail);
        setLoadError(null);
      } catch {
        if (!controller.signal.aborted) {
          setLoadError(t("couldNotLoadLedger"));
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [driverProfileId, page, reloadToken, t]);

  const amountTetri = lariTextToTetri(amount);

  async function postAdjustment() {
    if (amountTetri === null) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/finance/wallets/${driverProfileId}/adjustments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountTetri: direction === "credit" ? amountTetri : -amountTetri,
            reason: reason.trim(),
          }),
        },
      );

      if (!response.ok) {
        setError(await readErrorMessage(response, t("couldNotPostAdjustment")));
        setPending(false);
        return;
      }

      setAmount("");
      setReason("");
      setPending(false);
      // The new entry is the newest: show the first page, re-fetched.
      setPage(1);
      setReloadToken((token) => token + 1);
      onChanged();
    } catch {
      setError(t("couldNotPostAdjustment"));
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {data ? t("ledgerTitle", { name: data.driver.name }) : t("ledger")}
          </DialogTitle>
          <DialogDescription>
            {data ? data.driver.phone : (loadError ?? t("loadingLedger"))}
          </DialogDescription>
        </DialogHeader>

        {loadError !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        ) : null}

        {data ? (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-3 gap-3">
              {(
                [
                  ["balance", data.balanceTetri],
                  ["reserved", data.reservedTetri],
                  ["available", data.availableTetri],
                ] as const
              ).map(([labelKey, tetri]) => (
                <div
                  key={labelKey}
                  className="rounded-lg border border-border px-3 py-2"
                >
                  <dt className="text-xs text-muted-foreground">
                    {t(labelKey)}
                  </dt>
                  <dd className="font-mono text-base font-semibold">
                    {formatTetri(format, tetri)}
                  </dd>
                </div>
              ))}
            </dl>

            {data.driver.isRoster ? (
              <p className="text-sm text-destructive">{t("rosterNoWallet")}</p>
            ) : (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <p className="text-[13px] font-semibold">
                  {t("adjustmentTitle")}
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex gap-1.5">
                    {(["credit", "debit"] as const).map((candidate) => (
                      <Button
                        key={candidate}
                        type="button"
                        size="sm"
                        variant={
                          candidate === direction ? "secondary" : "outline"
                        }
                        aria-pressed={candidate === direction}
                        disabled={pending}
                        onClick={() => setDirection(candidate)}
                      >
                        {t(candidate)}
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="wallet-adjustment-amount">
                      {t("amountLari")}
                    </Label>
                    <Input
                      id="wallet-adjustment-amount"
                      inputMode="decimal"
                      className="w-36"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      disabled={pending}
                    />
                  </div>
                </div>
                <Label htmlFor="wallet-adjustment-reason">
                  {tShared("reason")}
                </Label>
                <Textarea
                  id="wallet-adjustment-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={MAX_WALLET_REASON_LENGTH}
                  disabled={pending}
                />
                <p className="text-xs text-muted-foreground">
                  {t("adjustmentHint")}
                </p>
                {error !== null ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      pending || amountTetri === null || reason.trim() === ""
                    }
                    onClick={() => void postAdjustment()}
                  >
                    {pending ? tShared("saving") : t("postAdjustment")}
                  </Button>
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tShared("date")}</TableHead>
                    <TableHead>{t("entry")}</TableHead>
                    <TableHead>{t("details")}</TableHead>
                    <TableHead className="text-right">{t("amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.entries.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-8 text-center text-muted-foreground"
                      >
                        {t("emptyLedger")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.entries.map((entry) => (
                      <TableRow key={entry.entryId}>
                        <TableCell>
                          {format.dateTime(new Date(entry.createdAt), {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </TableCell>
                        <TableCell>
                          {tRoot(ENTRY_TYPE_LABEL_KEYS[entry.type])}
                        </TableCell>
                        <TableCell className="max-w-[18rem] whitespace-normal">
                          <div className="flex flex-col">
                            {entry.order === null ? null : (
                              <span className="font-mono">
                                {entry.order.reference}
                              </span>
                            )}
                            {entry.reason === null ? null : (
                              <span>{entry.reason}</span>
                            )}
                            {entry.createdByName === null ? null : (
                              <span className="text-xs text-muted-foreground">
                                {t("byActor", { name: entry.createdByName })}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono ${
                            entry.amountTetri < 0 ? "text-destructive" : ""
                          }`}
                        >
                          {formatSignedTetri(format, entry.amountTetri)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {data.pageCount > 1 ? (
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
                  disabled={data.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  {tShared("previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page >= data.pageCount}
                  onClick={() => setPage((current) => current + 1)}
                >
                  {tShared("next")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
