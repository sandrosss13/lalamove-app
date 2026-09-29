"use client";

import { useCallback, useEffect, useState } from "react";

// Type-only imports, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — they are erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the table and the
// API drifting apart.
import type {
  AdminStaticPageListResponse,
  AdminStaticPageRow,
} from "@/app/api/admin/content/pages/route";
import {
  CONTENT_LOCALE_LABELS,
  StaticPageFormDialog,
  type StaticPageFormTarget,
} from "@/components/admin/content/static-page-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * role that may not manage content says so, instead of showing the same
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
 * The confirmation step before a page is removed. Deletion is irreversible —
 * `StaticPage` has no soft-delete column — so it never happens on a single
 * click, and the copy names the exact slug and locale being dropped.
 */
function DeletePageDialog({
  page,
  onClose,
  onCompleted,
}: {
  page: AdminStaticPageRow;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/content/pages/${page.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setError(await readErrorMessage(response, "Could not delete page."));
        return;
      }

      onCompleted();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this page?</DialogTitle>
          <DialogDescription>
            “{page.title}” ({CONTENT_LOCALE_LABELS[page.locale]}) will be
            removed permanently, and{" "}
            <span className="font-mono">/pages/{page.slug}</span> will stop
            resolving for that locale. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter showCloseButton={false}>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={handleDelete}
          >
            {pending ? "Deleting…" : "Delete page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * `/admin/content/pages` — the site's static pages (Terms, Privacy, About …),
 * one row per slug-and-locale pair, each publishable independently.
 *
 * A client component reading the list endpoint rather than a server component
 * querying Prisma directly, so a create, edit or delete refreshes the table
 * from one JSON call instead of re-rendering the whole admin shell. The section
 * layout above it already gates *viewing*, and the endpoints re-check the
 * `adminRole` on every request, which is the real boundary.
 */
export default function AdminStaticPagesPage() {
  const [items, setItems] = useState<AdminStaticPageRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<StaticPageFormTarget | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<AdminStaticPageRow | null>(
    null,
  );
  // Bumped after a mutation, purely to re-run the fetch below so the table
  // shows the state the database now holds rather than a patched copy.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    async function load() {
      try {
        const response = await fetch("/api/admin/content/pages", {
          signal: controller.signal,
        });

        if (!response.ok) {
          setError(await readErrorMessage(response, "Could not load pages."));
          setLoading(false);
          return;
        }

        const body = (await response.json()) as AdminStaticPageListResponse;
        setItems(body.items);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up (a newer load is already in
        // flight), not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError("Could not load pages.");
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [reloadToken]);

  /** Closes whichever dialog was open and re-reads the list. */
  const handleMutated = useCallback(() => {
    setFormTarget(null);
    setDeleteTarget(null);
    setReloadToken((token) => token + 1);
  }, []);

  const rows = items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Published pages are served at{" "}
          <span className="font-mono">/pages/[slug]</span>.
        </p>
        <Button size="sm" onClick={() => setFormTarget({ mode: "create" })}>
          New Page
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Slug</TableHead>
              <TableHead>Locale</TableHead>
              <TableHead>Title</TableHead>
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
                  Loading pages…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  No static pages yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((page) => (
                <TableRow key={page.id}>
                  <TableCell className="font-mono text-xs">
                    {page.slug}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {CONTENT_LOCALE_LABELS[page.locale]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{page.title}</span>
                      <span className="text-xs text-muted-foreground">
                        Updated {formatDate(page.updatedAt)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {page.isPublished ? (
                      <Badge variant="secondary">Published</Badge>
                    ) : (
                      <Badge variant="outline">Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormTarget({ mode: "edit", page })}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteTarget(page)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {formTarget ? (
        <StaticPageFormDialog
          // Keyed by what is being edited so the form's fields and error state
          // start from the right values for each page, without an effect to
          // reset them.
          key={formTarget.mode === "edit" ? formTarget.page.id : "create"}
          target={formTarget}
          onClose={() => setFormTarget(null)}
          onCompleted={handleMutated}
        />
      ) : null}

      {deleteTarget ? (
        <DeletePageDialog
          key={deleteTarget.id}
          page={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onCompleted={handleMutated}
        />
      ) : null}
    </div>
  );
}
