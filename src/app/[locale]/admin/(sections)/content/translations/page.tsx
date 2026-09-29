"use client";

import { useEffect, useState } from "react";

import type { ContentLocale } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the table and the
// API drifting apart.
import type {
  AdminTranslationListResponse,
  AdminTranslationRow,
} from "@/app/api/admin/content/translations/route";
import { TranslationFormDialog } from "@/components/admin/content/translation-form-dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/**
 * Sentinel for "no namespace filter". Radix's Select has no value for an
 * unselected item and rejects `""` as an item value, so the unfiltered choice
 * needs a stand-in that no real namespace can collide with — the routes trim
 * their input, so a namespace can never be this string.
 */
const ALL_NAMESPACES = "__all__";

const LOCALE_LABELS: Record<ContentLocale, string> = {
  KA: "Georgian",
  EN: "English",
};

/** The single locale row a delete confirmation is about. */
type DeleteTarget = {
  /** `TranslationEntry.id` — what the DELETE endpoint is keyed by. */
  id: string;
  namespace: string;
  key: string;
  locale: ContentLocale;
  value: string;
};

/** Which key the form dialog is open for: a new one, or an existing row. */
type FormState =
  { mode: "create" } | { mode: "edit"; row: AdminTranslationRow };

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
 * Confirmation for removing one locale row.
 *
 * Deleting is per locale rather than per key because that is what the endpoint
 * does — the two locales are separate records — so the copy names the language
 * being removed and points out that the key survives on the other side.
 *
 * Like the form dialog, it holds no `open` state: the parent mounts it only
 * while a row is selected, keyed by that row, so its pending and error state
 * start clean each time.
 */
function DeleteEntryDialog({
  target,
  onClose,
  onCompleted,
}: {
  target: DeleteTarget;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/content/translations/${target.id}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        setError(
          await readErrorMessage(response, "Could not delete this entry."),
        );
        setPending(false);
        return;
      }

      // The parent reloads and unmounts this dialog, so `pending` stays true —
      // the button must not flash back to its idle label in between.
      onCompleted();
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // None of Radix's dismiss paths should interrupt a request in flight.
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {LOCALE_LABELS[target.locale]} value</DialogTitle>
          <DialogDescription>
            Removes the {LOCALE_LABELS[target.locale]} text for{" "}
            <span className="text-foreground">
              {target.namespace}.{target.key}
            </span>
            . The other language keeps the key, and you can add this one back
            from the same row.
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-lg border border-border p-3 text-sm break-words">
          {target.value}
        </p>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter showCloseButton={false}>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Renders one locale's cell — its text, or a placeholder when the row is gone. */
function LocaleCell({ value }: { value: string | null }) {
  if (value === null) {
    return <span className="text-sm text-muted-foreground">Not set</span>;
  }

  return <span className="text-sm break-words">{value}</span>;
}

/**
 * `/admin/content/translations` — the Georgian/English strings the site's copy
 * is written in, grouped so a key's two languages sit side by side.
 *
 * A client component reading the list endpoint rather than a server component
 * querying Prisma directly, matching the rest of this admin surface: switching
 * namespaces and saving an edit re-query a single JSON endpoint instead of
 * re-rendering the whole admin shell. The section layout above it already gates
 * *viewing*, and the endpoints re-check the `adminRole` on every request, which
 * is the real boundary.
 *
 * Nothing on the public site reads these rows yet — this page makes the copy
 * manageable as data; wiring components up to `getTranslation()` is a separate
 * effort.
 */
export default function AdminTranslationsPage() {
  const [namespace, setNamespace] = useState(ALL_NAMESPACES);
  const [data, setData] = useState<AdminTranslationListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  // Bumped after any dialog closes, purely to re-run the fetch below so the
  // table shows the state the database now holds rather than a patched copy.
  // Reloading on a plain dismissal too is deliberate: it is one cheap GET, and
  // it means a save that partly failed can never leave a stale row on screen.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (namespace !== ALL_NAMESPACES) {
      params.set("namespace", namespace);
    }

    async function load() {
      try {
        const query = params.toString();
        const response = await fetch(
          `/api/admin/content/translations${query === "" ? "" : `?${query}`}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setError(
            await readErrorMessage(response, "Could not load translations."),
          );
          setLoading(false);
          return;
        }

        setData((await response.json()) as AdminTranslationListResponse);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up (a newer query is already in
        // flight), not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError("Could not load translations.");
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [namespace, reloadToken]);

  const items = data?.items ?? [];
  const namespaces = data?.namespaces ?? [];

  /** Closes whichever dialog is open and re-reads the list. */
  function closeDialogs() {
    setForm(null);
    setDeleteTarget(null);
    setReloadToken((token) => token + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={namespace} onValueChange={setNamespace}>
          <SelectTrigger
            aria-label="Filter translations by namespace"
            className="w-full max-w-72"
          >
            <SelectValue placeholder="All namespaces" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_NAMESPACES}>All namespaces</SelectItem>
            {namespaces.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-3">
          {data ? (
            <p className="text-sm text-muted-foreground">
              {items.length} {items.length === 1 ? "key" : "keys"}
            </p>
          ) : null}
          <Button size="sm" onClick={() => setForm({ mode: "create" })}>
            New Key
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Namespace</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Georgian (KA)</TableHead>
              <TableHead>English (EN)</TableHead>
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
                  Loading translations…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  {namespace === ALL_NAMESPACES
                    ? "No translations yet."
                    : "No translations in this namespace."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((row: AdminTranslationRow) => {
                // Destructured so each locale narrows to a definite entry
                // inside the menu items below, rather than being re-asserted.
                const { ka, en } = row;

                return (
                  <TableRow key={`${row.namespace}/${row.key}`}>
                    <TableCell className="align-top text-muted-foreground">
                      {row.namespace}
                    </TableCell>
                    <TableCell className="align-top font-medium break-words">
                      {row.key}
                    </TableCell>
                    <TableCell className="max-w-xs align-top">
                      <LocaleCell value={ka?.value ?? null} />
                    </TableCell>
                    <TableCell className="max-w-xs align-top">
                      <LocaleCell value={en?.value ?? null} />
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            Actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => setForm({ mode: "edit", row })}
                          >
                            Edit
                          </DropdownMenuItem>

                          {/* Only the locales that actually have a row can be
                              deleted; the endpoint is keyed by entry id. */}
                          {ka || en ? <DropdownMenuSeparator /> : null}

                          {ka ? (
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() =>
                                setDeleteTarget({
                                  id: ka.id,
                                  namespace: row.namespace,
                                  key: row.key,
                                  locale: "KA",
                                  value: ka.value,
                                })
                              }
                            >
                              Delete Georgian
                            </DropdownMenuItem>
                          ) : null}

                          {en ? (
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() =>
                                setDeleteTarget({
                                  id: en.id,
                                  namespace: row.namespace,
                                  key: row.key,
                                  locale: "EN",
                                  value: en.value,
                                })
                              }
                            >
                              Delete English
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {form ? (
        <TranslationFormDialog
          // Keyed by the key being edited so the fields start from the right
          // values for each one, without an effect to reset them.
          key={
            form.mode === "edit"
              ? `${form.row.namespace}/${form.row.key}`
              : "create"
          }
          target={form.mode === "edit" ? form.row : null}
          onClose={closeDialogs}
          onCompleted={closeDialogs}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteEntryDialog
          key={deleteTarget.id}
          target={deleteTarget}
          onClose={closeDialogs}
          onCompleted={closeDialogs}
        />
      ) : null}
    </div>
  );
}
