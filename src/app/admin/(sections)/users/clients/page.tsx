"use client";

import { Fragment, useEffect, useState } from "react";

import type { ClientAccountType } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the table and the
// API drifting apart.
import type {
  AdminClientListResponse,
  AdminClientRow,
} from "@/app/api/admin/users/clients/route";
import {
  SuspendDialog,
  type SuspendTarget,
} from "@/components/admin/users/suspend-dialog";
import { Badge } from "@/components/ui/badge";
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

/** Columns in the table, so the full-width state rows can span all of them. */
const COLUMN_COUNT = 6;

/** How long typing has to pause before the list is re-queried. */
const SEARCH_DEBOUNCE_MS = 300;

const ACCOUNT_TYPE_LABELS: Record<ClientAccountType, string> = {
  INDIVIDUAL: "Individual",
  BUSINESS: "Business",
};

/** Matches how every other dashboard in the app renders a date. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Pulls the API's `{ error }` message out of a failed response — a `403` for a
 * role that may not read this list says so, instead of showing the same
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

/** One label/value pair in an expanded row's detail panel. */
function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value ?? "—"}</dd>
    </div>
  );
}

/**
 * `/admin/users/clients` — the shipper side of the marketplace: every
 * `ClientProfile` with its account, order volume and moderation state.
 *
 * A client component reading the list endpoint rather than a server component
 * querying Prisma directly, because search and paging happen far more often
 * than a first load: typing a phone number re-queries a single JSON endpoint
 * instead of re-rendering the whole admin shell on the server per keystroke.
 * The section layout above it already gates *viewing*, and the endpoint
 * re-checks the `adminRole` on every request, which is the real boundary.
 *
 * Moderation here is deliberately narrow — read the account, read its history,
 * suspend or unsuspend it. Staff never edit a customer's own profile data on
 * their behalf, so nothing on this page is a form except the search box.
 */
export default function AdminClientsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminClientListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<SuspendTarget | null>(
    null,
  );
  // Bumped after a suspension changes, purely to re-run the fetch below so the
  // table shows the state the database now holds rather than a patched copy.
  const [reloadToken, setReloadToken] = useState(0);

  // Debounced so a search is one request per pause, not one per keystroke.
  // Any new query starts back at page 1 — page 3 of the previous result set
  // says nothing about this one.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchInput]);

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
          `/api/admin/users/clients?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setError(await readErrorMessage(response, "Could not load clients."));
          setLoading(false);
          return;
        }

        setData((await response.json()) as AdminClientListResponse);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up (a newer query is already in
        // flight), not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError("Could not load clients.");
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [page, query, reloadToken]);

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search by name, email or phone…"
          aria-label="Search clients by name, email or phone"
          className="w-full max-w-72"
        />
        {data ? (
          <p className="text-sm text-muted-foreground">
            {data.total} {data.total === 1 ? "client" : "clients"}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Orders</TableHead>
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
            ) : loading && data === null ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  Loading clients…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  {query === ""
                    ? "No client accounts yet."
                    : "No clients match that search."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((client: AdminClientRow) => {
                const expanded = expandedUserId === client.userId;

                return (
                  // Each account is a row plus, when opened, a full-width
                  // detail row beneath it — two siblings that must stay direct
                  // children of `<tbody>`, so a fragment carries the key.
                  <Fragment key={client.userId}>
                    <TableRow>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{client.name}</span>
                          {client.profileName &&
                          client.profileName !== client.name ? (
                            <span className="text-xs text-muted-foreground">
                              {client.profileName}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{client.email}</span>
                          <span className="text-xs text-muted-foreground">
                            {client.phone}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {ACCOUNT_TYPE_LABELS[client.accountType]}
                        </Badge>
                      </TableCell>
                      <TableCell>{client.orderCount}</TableCell>
                      <TableCell>
                        {client.isSuspended ? (
                          <Badge variant="destructive">Suspended</Badge>
                        ) : (
                          <Badge variant="secondary">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-expanded={expanded}
                            onClick={() =>
                              setExpandedUserId(expanded ? null : client.userId)
                            }
                          >
                            {expanded ? "Hide details" : "Details"}
                          </Button>
                          <Button
                            variant={
                              client.isSuspended ? "outline" : "destructive"
                            }
                            size="sm"
                            onClick={() =>
                              setSuspendTarget({
                                userId: client.userId,
                                name: client.name,
                                isSuspended: client.isSuspended,
                                suspendedReason: client.suspendedReason,
                              })
                            }
                          >
                            {client.isSuspended ? "Unsuspend" : "Suspend"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {expanded ? (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={COLUMN_COUNT}>
                          <dl className="grid grid-cols-2 gap-4 py-1 sm:grid-cols-4">
                            <DetailField
                              label="Account type"
                              value={ACCOUNT_TYPE_LABELS[client.accountType]}
                            />
                            <DetailField label="VAT ID" value={client.vatId} />
                            <DetailField
                              label="Orders placed"
                              value={String(client.orderCount)}
                            />
                            <DetailField
                              label="Joined"
                              value={formatDate(client.createdAt)}
                            />
                            {client.isSuspended ? (
                              <>
                                <DetailField
                                  label="Suspended on"
                                  value={
                                    client.suspendedAt
                                      ? formatDate(client.suspendedAt)
                                      : null
                                  }
                                />
                                <DetailField
                                  label="Suspension reason"
                                  value={client.suspendedReason}
                                />
                              </>
                            ) : null}
                          </dl>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
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

      {suspendTarget ? (
        <SuspendDialog
          // Keyed by account so the dialog's reason box and error state start
          // clean for each one, without an effect to reset them.
          key={suspendTarget.userId}
          target={suspendTarget}
          onClose={() => setSuspendTarget(null)}
          onCompleted={() => {
            setSuspendTarget(null);
            setReloadToken((token) => token + 1);
          }}
        />
      ) : null}
    </div>
  );
}
