"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time.
import type { AdminWalletListResponse } from "@/app/api/admin/finance/wallets/route";
import { formatTetri } from "@/components/admin/finance/wallet-format";
import { WalletLedgerDialog } from "@/components/admin/finance/wallet-ledger-dialog";
import { readErrorMessage } from "@/components/admin/read-error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Columns in the wallets table, so the state rows can span all of them. */
const COLUMN_COUNT = 5;

/** Columns in the held-jobs table. */
const HELD_COLUMN_COUNT = 5;

/** How long typing must pause before the search is sent. */
const SEARCH_DEBOUNCE_MS = 300;

/** Placeholder for a cell with nothing to show. */
const EMPTY_VALUE = "—";

/**
 * `/admin/finance/wallets` — every independent driver's balance, each opening
 * its ledger (and the manual adjustment form), and below it the jobs that were
 * deliberately not credited to anyone: loads a roster driver claimed on their
 * own.
 *
 * A client component reading the list endpoint, matching the other admin
 * listings. The section layout gates *viewing*; the endpoints re-check the
 * `adminRole` on every request, which is the real boundary.
 */
export default function AdminDriverWalletsPage() {
  const t = useTranslations("admin.adminWallet");
  const tShared = useTranslations("common.shared");
  const format = useFormatter();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminWalletListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDriverId, setOpenDriverId] = useState<string | null>(null);
  // Bumped after an adjustment, purely to re-run the fetch below.
  const [reloadToken, setReloadToken] = useState(0);

  // The typed text becomes the query once typing pauses, back on page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ page: String(page) });
    if (query !== "") {
      params.set("q", query);
    }

    async function load() {
      try {
        const response = await fetch(
          `/api/admin/finance/wallets?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setError(await readErrorMessage(response, t("couldNotLoadWallets")));
          setLoading(false);
          return;
        }

        setData((await response.json()) as AdminWalletListResponse);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up, not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError(t("couldNotLoadWallets"));
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [query, page, reloadToken, t]);

  const items = data?.items ?? [];
  const heldJobs = data?.heldJobs ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          type="search"
          className="w-72"
          aria-label={t("searchPlaceholder")}
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {data ? (
          <p className="text-sm text-muted-foreground">
            {t("driverCount", { count: data.total })}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tShared("driver")}</TableHead>
              <TableHead className="text-right">{t("balance")}</TableHead>
              <TableHead className="text-right">{t("reserved")}</TableHead>
              <TableHead className="text-right">{t("available")}</TableHead>
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
                  {t("loadingWallets")}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  {t("emptyWallets")}
                </TableCell>
              </TableRow>
            ) : (
              items.map((wallet) => (
                <TableRow key={wallet.driverProfileId}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{wallet.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {wallet.phone}
                      </span>
                      {wallet.isSuspended ? (
                        <span className="text-xs text-destructive">
                          {t("suspended")}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatTetri(format, wallet.balanceTetri)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatTetri(format, wallet.reservedTetri)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatTetri(format, wallet.availableTetri)}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-haspopup="dialog"
                      onClick={() => setOpenDriverId(wallet.driverProfileId)}
                    >
                      {t("viewLedger")}
                    </Button>
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

      <section className="flex flex-col gap-2 pt-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("heldJobsTitle")}</h2>
          {data ? (
            <p className="text-sm text-muted-foreground">
              {t("heldJobsCount", { count: data.heldCount })}
            </p>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {t("heldJobsDescription")}
        </p>
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("job")}</TableHead>
                <TableHead>{tShared("driver")}</TableHead>
                <TableHead>{tShared("company")}</TableHead>
                <TableHead className="text-right">{t("amount")}</TableHead>
                <TableHead>{t("held")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {heldJobs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={HELD_COLUMN_COUNT}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {t("heldJobsEmpty")}
                  </TableCell>
                </TableRow>
              ) : (
                heldJobs.map((held) => (
                  <TableRow key={held.holdId}>
                    <TableCell className="font-mono">
                      {held.order.reference}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{held.driver.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {held.driver.phone}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{held.companyName ?? EMPTY_VALUE}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatTetri(format, held.amountTetri)}
                    </TableCell>
                    <TableCell>
                      {format.dateTime(new Date(held.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {openDriverId ? (
        <WalletLedgerDialog
          driverProfileId={openDriverId}
          onClose={() => setOpenDriverId(null)}
          onChanged={() => setReloadToken((token) => token + 1)}
        />
      ) : null}
    </div>
  );
}
