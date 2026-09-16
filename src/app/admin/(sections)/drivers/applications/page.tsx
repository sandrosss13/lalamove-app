"use client";

import { useEffect, useState } from "react";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the table and the
// API drifting apart.
import type {
  AdminDriverApplicationListResponse,
  AdminDriverApplicationRow,
  AdminDriverApplicationStatus,
} from "@/app/api/admin/driver-applications/route";
import { APPLICATION_STATUS_CHIP_CLASSES } from "@/components/admin/application-status-colors";
import { DriverApplicationDetailDrawer } from "@/components/admin/driver-application-detail-drawer";
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
const COLUMN_COUNT = 5;

/** Placeholder for a cell the application has nothing to show for. */
const EMPTY_VALUE = "—";

/**
 * The filter pills above the table. `"ALL"` is this page's own value, not a
 * status: it is the absence of a `?status=` param, which the endpoint reads as
 * "every reviewable status".
 */
type ApplicationFilter = AdminDriverApplicationStatus | "ALL";

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
  { label: string; emptyMessage: string }
> = {
  ALL: { label: "All", emptyMessage: "No applications yet." },
  PENDING: { label: "Pending", emptyMessage: "No pending applications." },
  ACTION_REQUIRED: {
    label: "Action required",
    emptyMessage: "No action-required applications.",
  },
  APPROVED: { label: "Approved", emptyMessage: "No approved applications." },
};

/** Label for a row's status chip. */
const STATUS_LABELS: Record<AdminDriverApplicationStatus, string> = {
  PENDING: "Pending",
  ACTION_REQUIRED: "Action required",
  APPROVED: "Approved",
};

/**
 * Display names for the three cargo body types, matching the wizard's step-3a
 * cards. A local copy for the same reason the driver's review step keeps one:
 * an admin table must not depend on a driver-facing *screen* staying mounted or
 * keeping its internal constants exported. Keyed loosely because the row's
 * `chassisType` crosses the wire as a plain string.
 */
const CHASSIS_LABELS: Record<string, string> = {
  DRY_BOX: "Dry Box",
  REFRIGERATED: "Refrigerated Vehicle",
  OPEN_CHASSIS: "Open Chassis",
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
 * The Vehicle column's first line: "{class} · {chassis}". Either half can be
 * missing — an approved driver who retired their vehicle leaves the application
 * with no vehicle row at all (`vehicleId` nulls rather than cascading) — so the
 * present halves are joined and an entirely empty pair falls back to a dash.
 */
function formatVehicleSummary(application: AdminDriverApplicationRow): string {
  const parts = [
    application.vehicleClassName,
    application.chassisType === null
      ? null
      : // An unrecognised chassis type shows its raw enum value rather than
        // vanishing, so a new one added upstream is visible instead of silent.
        (CHASSIS_LABELS[application.chassisType] ?? application.chassisType),
  ].filter((part): part is string => part !== null && part !== "");

  return parts.length > 0 ? parts.join(" · ") : EMPTY_VALUE;
}

/**
 * `/admin/drivers/applications` — the self-serve driver onboarding review
 * queue: every submitted application, filterable by status, opening the detail
 * drawer that approves or flags its documents.
 *
 * A client component reading the list endpoint rather than a server component
 * querying Prisma directly, matching the other admin listings: filtering and
 * paging happen far more often than a first load, and a reviewer working the
 * queue re-fetches this list after every decision. The section layout above it
 * already gates *viewing*, and the endpoint re-checks the `adminRole` on every
 * request, which is the real boundary.
 */
export default function AdminDriverApplicationsPage() {
  const [filter, setFilter] = useState<ApplicationFilter>("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminDriverApplicationListResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The application whose drawer is open, by id — the same idea as the client
  // table's expanded row, driving a drawer instead of an inline panel.
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(
    null,
  );
  // Bumped after the drawer changes a document or a status, purely to re-run
  // the fetch below so the row's chip and Docs count show what the database now
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
          `/api/admin/driver-applications?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setError(
            await readErrorMessage(response, "Could not load applications."),
          );
          setLoading(false);
          return;
        }

        setData((await response.json()) as AdminDriverApplicationListResponse);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up (a newer query is already in
        // flight), not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError("Could not load applications.");
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [filter, page, reloadToken]);

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
                {FILTERS[candidate].label}
              </Button>
            );
          })}
        </div>
        {data ? (
          <p className="text-sm text-muted-foreground">
            {data.total} {data.total === 1 ? "application" : "applications"}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Categories</TableHead>
              <TableHead>Docs</TableHead>
              <TableHead>Status</TableHead>
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
                  Loading applications…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  {FILTERS[filter].emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              items.map((application: AdminDriverApplicationRow) => {
                const open = openApplicationId === application.applicationId;

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
                          {application.driverName}
                        </button>
                        <span className="font-mono text-xs text-muted-foreground">
                          {application.reference}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{formatVehicleSummary(application)}</span>
                        {application.plateNumber === null ? null : (
                          <span className="font-mono text-xs text-muted-foreground">
                            {application.plateNumber}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {application.categories.length > 0
                        ? application.categories.join(", ")
                        : EMPTY_VALUE}
                    </TableCell>
                    <TableCell>
                      {application.documentsApprovedCount}/
                      {application.documentsTotalCount}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          APPLICATION_STATUS_CHIP_CLASSES[application.status]
                        }
                      >
                        {STATUS_LABELS[application.status]}
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
            Page {data.page} of {data.pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || data.page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || data.page >= data.pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}

      {openApplicationId ? (
        <DriverApplicationDetailDrawer
          applicationId={openApplicationId}
          onClose={() => setOpenApplicationId(null)}
          // A decision inside the drawer changes the row behind it — re-fetch so
          // the chip and Docs count stay current.
          onChanged={() => setReloadToken((token) => token + 1)}
        />
      ) : null}
    </div>
  );
}
