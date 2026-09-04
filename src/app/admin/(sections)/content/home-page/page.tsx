"use client";

import { useCallback, useEffect, useState } from "react";

import type { ContentLocale } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the table and the
// API drifting apart.
import type {
  AdminHomePageSectionListResponse,
  AdminHomePageSectionRow,
} from "@/app/api/admin/content/home-page-sections/route";
import { HomePageSectionFormDialog } from "@/components/admin/content/home-page-section-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  HOME_PAGE_SECTION_TYPE_LABELS,
  isHomePageSectionType,
  parseHomePageSection,
} from "@/lib/admin/home-page-content";

/** Columns in the table, so the full-width state rows can span all of them. */
const COLUMN_COUNT = 6;

/** Locale tabs, in the order they are offered. */
const LOCALE_TABS: { value: ContentLocale; label: string }[] = [
  { value: "KA", label: "Georgian (KA)" },
  { value: "EN", label: "English (EN)" },
];

/**
 * The locale the page opens on.
 *
 * English, matching the locale the public landing page serves when nothing
 * selects one — so the tab shown first is the one whose rows are actually on
 * the live page today.
 */
const DEFAULT_LOCALE: ContentLocale = "EN";

/**
 * A one-line description of what a section says, for the table.
 *
 * Returns null for content that does not match its type, which is what marks
 * the row as needing attention rather than hiding the problem.
 *
 * The switch is exhaustive over the section union and deliberately has no
 * `default:` arm. Most types are summarised by their heading, but five carry no
 * heading at all, so a `default:` reading one would compile only by testing for
 * the key at runtime — and would quietly report every future headingless type
 * as unparseable content. Without it, adding a section type is a compile error
 * here, which is a question answered once rather than a wrong cell shipped.
 */
function summarize(row: AdminHomePageSectionRow): string | null {
  const parsed = parseHomePageSection(row.type, row.content);

  if ("error" in parsed) {
    return null;
  }

  switch (parsed.data.type) {
    case "hero":
      // `headlineHighlight` is optional since the redesign, so a hero authored
      // without one summarises as its headline alone rather than "… undefined".
      return [
        parsed.data.content.headline,
        parsed.data.content.headlineHighlight,
      ]
        .filter(Boolean)
        .join(" ");
    case "hero_carousel":
      // Its only field is an optional fallback caption, so the useful thing to
      // say is where the slides actually come from.
      return "Slides come from Banners (home_hero)";
    case "partner_marquee":
      // Same: the logos are Banner rows, and the eyebrow is the only copy.
      return parsed.data.content.eyebrow;
    case "stats":
      // No heading and no eyebrow — the figures themselves are the summary.
      return parsed.data.content.items.map((item) => item.value).join(" · ");
    case "bento":
      return parsed.data.content.heading;
    case "quote_calculator":
      return parsed.data.content.heading;
    case "how_it_works":
      return parsed.data.content.heading;
    case "vehicle_types":
      return parsed.data.content.heading;
    case "driver_cta":
      // Its headline is authored across two lines; flattened to one for a cell.
      return parsed.data.content.headline.split("\n").join(" ");
    case "coverage":
      return parsed.data.content.heading;
    case "faq":
      return parsed.data.content.heading;
    case "closing_cta":
      return parsed.data.content.heading;
    case "category_tiles":
      return parsed.data.content.heading;
    case "nav":
      return parsed.data.content.wordmark;
    case "footer":
      return parsed.data.content.brandName;
  }
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
 * `/admin/content/home-page` — the composition of the public landing page.
 *
 * Each row is a `HomePageSection`: a section type, the content it renders with,
 * and where it sits in the running order. The public page reads exactly this
 * list, filtered to active rows of one locale and sorted by `sortOrder`, and
 * falls back to its built-in default composition when a locale has no rows —
 * so an empty table here is a valid state, not a broken page.
 *
 * A client component reading the list endpoint rather than a server component
 * querying Prisma directly, because this page is almost entirely mutations:
 * creating, editing, reordering, toggling and deleting all need the table to
 * refresh immediately afterwards. The section layout above it already gates
 * *viewing*, and every endpoint re-checks the `adminRole` on each request,
 * which is the real boundary.
 */
export default function AdminHomePageSectionsPage() {
  const [locale, setLocale] = useState<ContentLocale>(DEFAULT_LOCALE);
  const [sections, setSections] = useState<AdminHomePageSectionRow[] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * The section the form dialog is open for. `undefined` means closed; `null`
   * means open for a new section, which is why this is not just `... | null`.
   */
  const [formTarget, setFormTarget] =
    useState<AdminHomePageSectionRow | null>();
  const [deleteTarget, setDeleteTarget] =
    useState<AdminHomePageSectionRow | null>(null);
  /** Set while a toggle, reorder or delete is in flight, to disable controls. */
  const [busy, setBusy] = useState(false);
  /** Failures from actions that have no dialog of their own. */
  const [actionError, setActionError] = useState<string | null>(null);
  // Bumped after any mutation, purely to re-run the fetch below so the table
  // shows the state the database now holds rather than a patched copy.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    async function load() {
      try {
        const response = await fetch(
          `/api/admin/content/home-page-sections?locale=${locale}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setError(
            await readErrorMessage(response, "Could not load sections."),
          );
          setLoading(false);
          return;
        }

        const body =
          (await response.json()) as AdminHomePageSectionListResponse;
        setSections(body.items);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up (a newer load is already in
        // flight), not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError("Could not load sections.");
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [locale, reloadToken]);

  const items = sections ?? [];

  /** One `PATCH` against a section, reporting its message on failure. */
  const patchSection = useCallback(
    async (id: string, body: Record<string, unknown>, fallback: string) => {
      const response = await fetch(
        `/api/admin/content/home-page-sections/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, fallback));
      }
    },
    [],
  );

  /** Flips one section on or off the public page, straight from the table. */
  async function handleToggleActive(section: AdminHomePageSectionRow) {
    setBusy(true);
    setActionError(null);

    try {
      await patchSection(
        section.id,
        // A partial patch: nothing else about the section is being confirmed
        // here, so nothing else is overwritten.
        { isActive: !section.isActive },
        "Could not update this section.",
      );
      setReloadToken((token) => token + 1);
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * Moves one section up or down the page.
   *
   * The whole locale is renumbered to its displayed positions rather than the
   * two rows simply swapping values, because `sortOrder` carries no uniqueness
   * constraint: rows can share a value (every new row defaults to 0), and
   * swapping equal numbers would move nothing. Only rows whose position
   * actually changed are written, so an already-normalized list costs two
   * requests.
   */
  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;

    if (target < 0 || target >= items.length) {
      return;
    }

    const moving = items[index];
    const displaced = items[target];

    // Both indices were just bounds-checked against the same array; the guard
    // is what says so to the compiler, which types every indexed read as
    // possibly undefined.
    if (!moving || !displaced) {
      return;
    }

    const reordered = [...items];
    reordered[index] = displaced;
    reordered[target] = moving;

    setBusy(true);
    setActionError(null);

    try {
      for (const [position, section] of reordered.entries()) {
        if (section.sortOrder !== position) {
          await patchSection(
            section.id,
            { sortOrder: position },
            "Could not reorder the sections.",
          );
        }
      }

      setReloadToken((token) => token + 1);
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Something went wrong. Please try again.",
      );
      // Reloaded even on failure: some rows may already have been renumbered,
      // so the table must not keep showing the order it started from.
      setReloadToken((token) => token + 1);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(section: AdminHomePageSectionRow) {
    setBusy(true);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/admin/content/home-page-sections/${section.id}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        setActionError(
          await readErrorMessage(response, "Could not delete this section."),
        );
        return;
      }

      setDeleteTarget(null);
      setReloadToken((token) => token + 1);
    } catch {
      setActionError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Where a new section lands: after the last one. Max rather than the row
  // count, so it still sorts last when the existing values have gaps.
  const nextSortOrder =
    items.length === 0
      ? 0
      : Math.max(...items.map((section) => section.sortOrder)) + 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          The sections of the public landing page, in the order they render.
          With no sections for a locale, the page falls back to its built-in
          default composition. The navigation bar and the footer are page
          chrome: they render at the top and the bottom whatever their position
          in this list, so moving them changes nothing.
        </p>
        <Button size="sm" onClick={() => setFormTarget(null)}>
          New Section
        </Button>
      </div>

      <Tabs
        value={locale}
        onValueChange={(value) => setLocale(value as ContentLocale)}
      >
        <TabsList>
          {LOCALE_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Skipped while the delete confirmation is open, which shows the same
          message itself rather than leaving it stranded behind the overlay. */}
      {actionError && deleteTarget === null ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Content</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Move</TableHead>
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
            ) : loading && sections === null ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  Loading sections…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  No sections for this locale yet — the landing page is showing
                  its default composition.
                </TableCell>
              </TableRow>
            ) : (
              items.map((section, index) => {
                // Narrowed inline rather than through a boolean, so indexing
                // the label map is type-safe: `type` is a free-form column and
                // a row can hold a value this build does not know.
                const typeLabel = isHomePageSectionType(section.type)
                  ? HOME_PAGE_SECTION_TYPE_LABELS[section.type]
                  : section.type;
                const known = isHomePageSectionType(section.type);
                const summary = summarize(section);

                return (
                  <TableRow key={section.id}>
                    <TableCell className="text-muted-foreground">
                      {section.sortOrder}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{typeLabel}</span>
                        {known ? null : (
                          <Badge variant="destructive" className="mt-1 w-fit">
                            Unrecognized type
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {summary === null ? (
                        <span className="text-destructive">
                          Content does not match this type
                        </span>
                      ) : (
                        <span className="line-clamp-2 text-muted-foreground">
                          {summary}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={section.isActive}
                        disabled={busy}
                        aria-label={`${
                          section.isActive ? "Deactivate" : "Activate"
                        } the ${typeLabel} section`}
                        onCheckedChange={() => void handleToggleActive(section)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || index === 0}
                          aria-label="Move section up"
                          onClick={() => void handleMove(index, -1)}
                        >
                          ↑
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || index === items.length - 1}
                          aria-label="Move section down"
                          onClick={() => void handleMove(index, 1)}
                        >
                          ↓
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFormTarget(section)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            // A failure from an earlier action must not follow
                            // the admin into this confirmation.
                            setActionError(null);
                            setDeleteTarget(section);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {formTarget !== undefined ? (
        <HomePageSectionFormDialog
          // Keyed by section so the form starts from the right values for each
          // one (and the defaults for a new section), without an effect to
          // resync them. The locale is part of the key so switching tabs with
          // the dialog open cannot leave a stale target behind.
          key={`${locale}-${formTarget?.id ?? "new"}`}
          section={formTarget}
          locale={locale}
          nextSortOrder={nextSortOrder}
          onClose={() => setFormTarget(undefined)}
          onCompleted={() => {
            setFormTarget(undefined);
            setReloadToken((token) => token + 1);
          }}
        />
      ) : null}

      {deleteTarget ? (
        <Dialog
          open
          onOpenChange={(open) => {
            // Radix reports Escape, the overlay and the close button all
            // through here; none of them should interrupt a delete in flight.
            if (!open && !busy) {
              setDeleteTarget(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete section</DialogTitle>
              <DialogDescription>
                This section will be removed from the landing page for good. To
                take it off the page without deleting it, switch it off instead.
              </DialogDescription>
            </DialogHeader>

            {/* Reported here rather than only behind the overlay, so a refused
                delete is visible without dismissing the dialog. */}
            {actionError ? (
              <p role="alert" className="text-sm text-destructive">
                {actionError}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void handleDelete(deleteTarget)}
              >
                {busy ? "Deleting…" : "Delete section"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
