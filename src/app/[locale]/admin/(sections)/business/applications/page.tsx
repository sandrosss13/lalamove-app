"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the table and the
// API drifting apart.
import type {
  AdminBusinessApplicationListResponse,
  AdminBusinessApplicationRow,
  AdminBusinessApplicationStatus,
} from "@/app/api/admin/business-applications/route";
import { APPLICATION_STATUS_CHIP_CLASSES } from "@/components/admin/application-status-colors";
import { BusinessApplicationDetailDrawer } from "@/components/admin/business-application-detail-drawer";
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
import { useLocalizedCityOptions } from "@/lib/georgian-cities";

/** Columns in the table, so the full-width state rows can span all of them. */
const COLUMN_COUNT = 5;

/** Placeholder for a cell the application has nothing to show for. */
const EMPTY_VALUE = "—";

/**
 * The filter pills above the table. `"ALL"` is this page's own value, not a
 * status: it is the absence of a `?status=` param, which the endpoint reads as
 * "every reviewable status".
 */
type ApplicationFilter = AdminBusinessApplicationStatus | "ALL";

/** The pills, left to right. Separate from the map below so the order is data,
 *  not object-key order. */
const FILTER_ORDER: readonly ApplicationFilter[] = [
  "ALL",
  "PENDING",
  "ACTION_REQUIRED",
  "APPROVED",
];

/**
 * Each pill's label and the copy shown when that filter matches nothing. The
 * empty copy names the active filter, so a reviewer who has cleared the pending
 * queue is told exactly that rather than being shown the same "no results" that
 * an empty database would produce.
 *
 * A `Record` keyed by the filter union rather than an array searched at render
 * time: every lookup is then total, so there is no "no such filter" branch to
 * write for a value the type system already closed.
 */
const FILTERS: Record<
  ApplicationFilter,
  { labelKey: string; emptyKey: string }
> = {
  // Full dotted paths: "All" is shared copy, while the statuses use the
  // *application* wording (under review), not the order-status one.
  ALL: {
    labelKey: "common.shared.all",
    emptyKey: "admin.adminBusinessApplications.emptyAll",
  },
  PENDING: {
    labelKey: "admin.applicationStatus.pending",
    emptyKey: "admin.adminBusinessApplications.emptyPending",
  },
  ACTION_REQUIRED: {
    labelKey: "admin.applicationStatus.actionRequired",
    emptyKey: "admin.adminBusinessApplications.emptyActionRequired",
  },
  APPROVED: {
    labelKey: "admin.applicationStatus.approved",
    emptyKey: "admin.adminBusinessApplications.emptyApproved",
  },
};

/**
 * The second line under the status chip: a business application carries two
 * verdict tracks, and without this a reviewer cannot tell a PENDING application
 * whose company is already cleared from one nobody has touched.
 *
 * `VERIFIED` maps to `null` deliberately — a green "verified" line on every row
 * is noise. Keyed by the row's own union rather than an index signature so the
 * lookup is total under `noUncheckedIndexedAccess`, and so a fourth review
 * status added upstream is a type error here rather than a silently blank cell.
 */
const COMPANY_REVIEW_NOTES: Record<
  AdminBusinessApplicationRow["companyReviewStatus"],
  { textKey: string; className: string } | null
> = {
  VERIFIED: null,
  PENDING: {
    textKey: "companyUnverified",
    className: "text-[11px] text-muted-foreground",
  },
  FLAGGED: {
    textKey: "companyFlagged",
    className: "text-[11px] text-destructive",
  },
};

/**
 * Pulls the API's `{ error }` message out of a failed response — a `403` for a
 * role that may not review applications says so, instead of showing the same
 * "could not load" as a network failure.
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

/**
 * The City column: the registered city plus how many other cities of operation
 * the company declared — the design's "Tbilisi +2". A city value that predates
 * the enum-backed picker falls back to its stored value rather than vanishing.
 */
function formatCityColumn(
  row: AdminBusinessApplicationRow,
  cityOptions: readonly { value: string; label: string }[],
): string {
  if (row.primaryCity === "") return EMPTY_VALUE;

  const label =
    cityOptions.find((option) => option.value === row.primaryCity)?.label ??
    row.primaryCity;

  return row.otherCitiesCount > 0 ? `${label} +${row.otherCitiesCount}` : label;
}

/**
 * `/admin/business/applications` — the self-serve logistics-company fleet
 * registration review queue: every submitted business application, filterable
 * by status, opening the detail drawer that verifies the company and rules on
 * its vehicles.
 *
 * A client component reading the list endpoint rather than a server component
 * querying Prisma directly, matching the driver queue and every other admin
 * listing: filtering and paging happen far more often than a first load, and a
 * reviewer working the queue re-fetches this list after every decision. The
 * section layout above it already gates *viewing*, and the endpoint re-checks
 * the `adminRole` on every request, which is the real boundary.
 */
export default function AdminBusinessApplicationsPage() {
  const t = useTranslations("admin.adminBusinessApplications");
  const tShared = useTranslations("common.shared");
  const tRoot = useTranslations();
  const cityOptions = useLocalizedCityOptions();
  /** Label for a row's application status chip. */
  const statusLabels: Record<AdminBusinessApplicationStatus, string> = {
    PENDING: tRoot("admin.applicationStatus.pending"),
    ACTION_REQUIRED: tRoot("admin.applicationStatus.actionRequired"),
    APPROVED: t("fleetActive"),
  };
  const [filter, setFilter] = useState<ApplicationFilter>("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminBusinessApplicationListResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The application whose drawer is open, by id.
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(
    null,
  );
  // Bumped after the drawer records a verdict, purely to re-run the fetch below
  // so the row's chips, Fleet and Drivers counts show what the database now
  // holds rather than a patched copy.
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
          `/api/admin/business-applications?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setError(
            await readErrorMessage(
              response,
              t("couldNotLoadFleetApplications"),
            ),
          );
          setLoading(false);
          return;
        }

        setData(
          (await response.json()) as AdminBusinessApplicationListResponse,
        );
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up (a newer query is already in
        // flight), not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError(t("couldNotLoadFleetApplications"));
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
            {t("applicationCount", { count: data.total })}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tShared("company")}</TableHead>
              <TableHead>{tShared("city")}</TableHead>
              <TableHead>{tShared("fleet")}</TableHead>
              <TableHead>{tShared("drivers")}</TableHead>
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
                  {t("loadingFleetApplications")}
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
              items.map((application: AdminBusinessApplicationRow) => {
                const open = openApplicationId === application.applicationId;
                const companyNote =
                  COMPANY_REVIEW_NOTES[application.companyReviewStatus];

                return (
                  <TableRow
                    key={application.applicationId}
                    // Highlighted while its drawer is open, so the reviewer can
                    // see which row they are working on behind it.
                    data-state={open ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() =>
                      setOpenApplicationId(application.applicationId)
                    }
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        {/* The row's mouse target is the whole `<tr>`; this
                            button is what makes the same action reachable from
                            the keyboard, since a table row cannot be focused.
                            Its click bubbles to the row's handler, which opens
                            the drawer this row is already about. */}
                        <button
                          type="button"
                          className="text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                          aria-haspopup="dialog"
                          aria-expanded={open}
                        >
                          {application.companyName}
                        </button>
                        <span className="font-mono text-xs text-muted-foreground">
                          {application.reference}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatCityColumn(application, cityOptions)}
                    </TableCell>
                    <TableCell>{application.fleetSize}</TableCell>
                    {/* Mono for counts, per the design. */}
                    <TableCell className="font-price">
                      {application.driversAssignedCount}/{application.fleetSize}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge
                          className={
                            APPLICATION_STATUS_CHIP_CLASSES[application.status]
                          }
                        >
                          {statusLabels[application.status]}
                        </Badge>
                        {companyNote ? (
                          <span className={companyNote.className}>
                            {t(companyNote.textKey)}
                          </span>
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

      {openApplicationId ? (
        <BusinessApplicationDetailDrawer
          applicationId={openApplicationId}
          onClose={() => setOpenApplicationId(null)}
          // A decision inside the drawer changes the row behind it — re-fetch so
          // the chips, Fleet and Drivers counts stay current.
          onChanged={() => setReloadToken((token) => token + 1)}
        />
      ) : null}
    </div>
  );
}
