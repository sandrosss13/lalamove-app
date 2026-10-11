"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time.
import type { AdminSupportMessageListResponse } from "@/app/api/admin/support-messages/route";
import { readErrorMessage } from "@/components/admin/read-error-message";
import {
  SUPPORT_STATUS_LABEL_KEYS,
  SUPPORT_TOPIC_LABEL_KEYS,
  SupportMessageDetailDialog,
} from "@/components/admin/support-message-detail-dialog";
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
import type { SupportMessageStatus } from "@/lib/support/rules";

/** Columns in the table, so the full-width state rows can span all of them. */
const COLUMN_COUNT = 5;

/** Placeholder for a cell with nothing to show. */
const EMPTY_VALUE = "—";

/**
 * The filter pills. `"ALL"` is this page's own value — the absence of a
 * `?status=` param. The page opens on `OPEN`: the backlog is the work.
 */
type MessageFilter = SupportMessageStatus | "ALL";

const FILTER_ORDER: readonly MessageFilter[] = ["OPEN", "RESOLVED", "ALL"];

/** Each pill's label and the copy shown when that filter matches nothing. */
const FILTERS: Record<MessageFilter, { labelKey: string; emptyKey: string }> = {
  OPEN: {
    labelKey: SUPPORT_STATUS_LABEL_KEYS.OPEN,
    emptyKey: "admin.adminSupportMessages.emptyOpen",
  },
  RESOLVED: {
    labelKey: SUPPORT_STATUS_LABEL_KEYS.RESOLVED,
    emptyKey: "admin.adminSupportMessages.emptyResolved",
  },
  ALL: {
    labelKey: "common.shared.all",
    emptyKey: "admin.adminSupportMessages.emptyAll",
  },
};

/**
 * `/admin/support/messages` — what drivers sent from the app's Support screen:
 * filterable by open/resolved, each row opening the full message with the
 * driver's phone number, the linked job and the "mark resolved" action.
 *
 * A client component reading the list endpoint, matching the other admin
 * listings. The section layout gates *viewing*; the endpoint re-checks the
 * `adminRole` on every request, which is the real boundary.
 */
export default function AdminSupportMessagesPage() {
  const t = useTranslations("admin.adminSupportMessages");
  const tShared = useTranslations("common.shared");
  const tRoot = useTranslations();
  const format = useFormatter();
  const [filter, setFilter] = useState<MessageFilter>("OPEN");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminSupportMessageListResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);
  // Bumped after a message is resolved, purely to re-run the fetch below.
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
          `/api/admin/support-messages?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setError(await readErrorMessage(response, t("couldNotLoadMessages")));
          setLoading(false);
          return;
        }

        setData((await response.json()) as AdminSupportMessageListResponse);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up, not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError(t("couldNotLoadMessages"));
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [filter, page, reloadToken, t]);

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
            {t("messageCount", { count: data.total })} ·{" "}
            {t("openCount", { count: data.openCount })}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tShared("driver")}</TableHead>
              <TableHead>{t("topic")}</TableHead>
              <TableHead>{t("job")}</TableHead>
              <TableHead>{t("sent")}</TableHead>
              <TableHead>{tShared("status")}</TableHead>
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
                  {t("loadingMessages")}
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
              items.map((message) => {
                const open = openMessageId === message.messageId;

                return (
                  <TableRow
                    key={message.messageId}
                    data-state={open ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => setOpenMessageId(message.messageId)}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        {/* The row's mouse target is the whole `<tr>`; this
                            button makes the same action reachable from the
                            keyboard, since a table row cannot be focused. */}
                        <button
                          type="button"
                          className="text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                          aria-haspopup="dialog"
                          aria-expanded={open}
                        >
                          {message.driver.name}
                        </button>
                        <span className="font-mono text-xs text-muted-foreground">
                          {message.driver.phone}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[22rem]">
                      <div className="flex flex-col">
                        <span>
                          {tRoot(SUPPORT_TOPIC_LABEL_KEYS[message.topic])}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {message.bodyPreview}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">
                      {message.order?.reference ?? EMPTY_VALUE}
                    </TableCell>
                    <TableCell>
                      {format.dateTime(new Date(message.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          message.status === "OPEN" ? "default" : "secondary"
                        }
                      >
                        {tRoot(SUPPORT_STATUS_LABEL_KEYS[message.status])}
                      </Badge>
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

      {openMessageId ? (
        <SupportMessageDetailDialog
          messageId={openMessageId}
          onClose={() => setOpenMessageId(null)}
          onChanged={() => setReloadToken((token) => token + 1)}
        />
      ) : null}
    </div>
  );
}
