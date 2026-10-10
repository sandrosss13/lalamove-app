"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import type { ContentLocale } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the table and the
// API drifting apart.
import type {
  AdminBannerListResponse,
  AdminBannerRow,
} from "@/app/api/admin/content/banners/route";
import { BannerFormDialog } from "@/components/admin/content/banner-form-dialog";
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
import {
  HOME_HERO_BANNER_PLACEMENT,
  MAX_HERO_BANNERS,
} from "@/lib/admin/home-page-content";

/** Columns in the table, so the full-width state rows can span all of them. */
const COLUMN_COUNT = 7;

/** `common.shared` keys for each content locale's name. */
const LOCALE_LABEL_KEYS: Record<ContentLocale, string> = {
  KA: "georgian",
  EN: "english",
};

/**
 * UTC so a window reads back exactly as it was entered: the form writes each
 * end as an instant of a UTC day, so rendering in the viewer's zone would show
 * a banner set to end on the 30th as ending on the 29th or the 31st.
 */
const WINDOW_DATE_FORMAT = {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
} as const;

/** How full one locale's hero carousel is, as the summary line renders it. */
type HeroCapacityRow = {
  locale: ContentLocale;
  active: number;
};

/**
 * Active `home_hero` banners per locale, derived from the rows already loaded
 * rather than from a second request: the list endpoint is unpaginated, so the
 * table's own data is the whole truth about the carousel.
 *
 * A locale is listed as soon as it has *any* hero banner, active or not, so
 * switching the last one off leaves the line reading "0 of 6" instead of the
 * summary silently disappearing. The count itself follows `isActive` alone,
 * which is exactly what the server-side cap counts — the display window is a
 * scheduling tool, not a slot reservation, so a scheduled banner still occupies
 * its slot here.
 */
function summarizeHeroCapacity(banners: AdminBannerRow[]): HeroCapacityRow[] {
  const activeByLocale = new Map<ContentLocale, number>();

  for (const banner of banners) {
    if (banner.placement !== HOME_HERO_BANNER_PLACEMENT) {
      continue;
    }

    const active = activeByLocale.get(banner.locale) ?? 0;
    activeByLocale.set(banner.locale, active + (banner.isActive ? 1 : 0));
  }

  return [...activeByLocale].map(([locale, active]) => ({ locale, active }));
}

/**
 * The active window as one cell of text, whichever ends are set. `formatDate`
 * and `t` (bound to `admin.adminContentBanners`) come from the component, so
 * both the dates and the wording follow the reader's locale.
 */
function formatWindow(
  banner: AdminBannerRow,
  formatDate: (iso: string) => string,
  t: (key: string, values?: Record<string, string>) => string,
): string {
  if (banner.startsAt !== null && banner.endsAt !== null) {
    return t("windowRange", {
      start: formatDate(banner.startsAt),
      end: formatDate(banner.endsAt),
    });
  }

  if (banner.startsAt !== null) {
    return t("windowFrom", { date: formatDate(banner.startsAt) });
  }

  if (banner.endsAt !== null) {
    return t("windowUntil", { date: formatDate(banner.endsAt) });
  }

  return t("always");
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
 * `/admin/content/banners` — the promotional image slots on the public site.
 *
 * A client component reading the list endpoint rather than a server component
 * querying Prisma directly, because this page is almost entirely mutations:
 * creating, editing, deleting and toggling all need the table to refresh
 * immediately afterwards, which is one `fetch` here instead of a full server
 * re-render of the admin shell per action. The section layout above it already
 * gates *viewing*, and every endpoint re-checks the `adminRole` on each
 * request, which is the real boundary.
 *
 * Ordering is edited as a number on the banner itself rather than by dragging
 * rows: `sortOrder` is what the public site reads, and a plain field keeps one
 * banner's position from silently rewriting every other row's.
 */
export default function AdminBannersPage() {
  const t = useTranslations("admin.adminContentBanners");
  const tShared = useTranslations("common.shared");
  const format = useFormatter();
  const formatDate = (iso: string) =>
    format.dateTime(new Date(iso), WINDOW_DATE_FORMAT);
  const [banners, setBanners] = useState<AdminBannerRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * The banner the form dialog is open for. `undefined` means closed; `null`
   * means open for a new banner, which is why this is not just `... | null`.
   */
  const [formTarget, setFormTarget] = useState<AdminBannerRow | null>();
  const [deleteTarget, setDeleteTarget] = useState<AdminBannerRow | null>(null);
  /** The banner whose active toggle or deletion is currently in flight. */
  const [pendingId, setPendingId] = useState<string | null>(null);
  /** Failures from a toggle or a delete, which have no dialog of their own. */
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
        const response = await fetch("/api/admin/content/banners", {
          signal: controller.signal,
        });

        if (!response.ok) {
          setError(await readErrorMessage(response, t("couldNotLoadBanners")));
          setLoading(false);
          return;
        }

        const body = (await response.json()) as AdminBannerListResponse;
        setBanners(body.items);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up (a newer load is already in
        // flight), not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError(t("couldNotLoadBanners"));
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [reloadToken, t]);

  /** Flips one banner's visibility straight from the table. */
  async function handleToggleActive(banner: AdminBannerRow) {
    setPendingId(banner.id);
    setActionError(null);

    try {
      const response = await fetch(`/api/admin/content/banners/${banner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // The one place a partial patch is sent: nothing else about the banner
        // is being confirmed here, so nothing else is overwritten.
        body: JSON.stringify({ isActive: !banner.isActive }),
      });

      if (!response.ok) {
        setActionError(
          await readErrorMessage(response, t("couldNotUpdateThisBanner")),
        );
        return;
      }

      setReloadToken((token) => token + 1);
    } catch {
      setActionError(tShared("somethingWentWrongPleaseTryAgain"));
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(banner: AdminBannerRow) {
    setPendingId(banner.id);
    setActionError(null);

    try {
      const response = await fetch(`/api/admin/content/banners/${banner.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setActionError(
          await readErrorMessage(response, t("couldNotDeleteThisBanner")),
        );
        return;
      }

      setDeleteTarget(null);
      setReloadToken((token) => token + 1);
    } catch {
      setActionError(tShared("somethingWentWrongPleaseTryAgain"));
    } finally {
      setPendingId(null);
    }
  }

  const items = banners ?? [];
  const heroCapacity = summarizeHeroCapacity(items);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-muted-foreground">
            {t("promotionalImagesOnThePublicSite")}
          </p>

          {/* Shown before anything is saved, so the cap is learned here rather
              than from the 409 the routes return on a seventh hero banner. */}
          {heroCapacity.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {heroCapacity.map(({ locale, active }) => {
                const full = active >= MAX_HERO_BANNERS;

                return (
                  <li
                    key={locale}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <span>
                      {t.rich("heroCapacity", {
                        language: tShared(LOCALE_LABEL_KEYS[locale]),
                        active,
                        max: MAX_HERO_BANNERS,
                        strong: (chunks) => (
                          <span
                            className={
                              full
                                ? "font-medium text-destructive"
                                : "font-medium text-foreground"
                            }
                          >
                            {chunks}
                          </span>
                        ),
                      })}
                    </span>
                    {full ? <Badge variant="outline">{t("full")}</Badge> : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <Button size="sm" onClick={() => setFormTarget(null)}>
          {t("newBanner")}
        </Button>
      </div>

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
              <TableHead>{t("banner")}</TableHead>
              <TableHead>{tShared("locale")}</TableHead>
              <TableHead>{tShared("placement")}</TableHead>
              <TableHead>{tShared("order")}</TableHead>
              <TableHead>{tShared("activeWindow")}</TableHead>
              <TableHead>{tShared("active")}</TableHead>
              <TableHead className="text-right">{tShared("actions")}</TableHead>
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
            ) : loading && banners === null ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  {t("loadingBanners")}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  {t("noBannersYet")}
                </TableCell>
              </TableRow>
            ) : (
              items.map((banner) => (
                <TableRow key={banner.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {/*
                        Plain <img> rather than next/image: the URL is typed in
                        by a content editor and can point at any host, so it
                        can't be pinned in `remotePatterns` at build time.
                      */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={banner.imageUrl}
                        alt=""
                        loading="lazy"
                        className="h-10 w-16 shrink-0 rounded border border-border object-cover"
                      />
                      <div className="flex min-w-0 flex-col">
                        {banner.title ? (
                          <span className="font-medium">{banner.title}</span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            {t("untitled")}
                          </span>
                        )}
                        {banner.linkUrl ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {banner.linkUrl}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {tShared(LOCALE_LABEL_KEYS[banner.locale])}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {banner.placement}
                  </TableCell>
                  <TableCell>{banner.sortOrder}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatWindow(banner, formatDate, t)}
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={banner.isActive}
                      disabled={pendingId === banner.id}
                      aria-label={t("toggleActiveLabel", {
                        isActive: String(banner.isActive),
                        title: banner.title || t("untitled"),
                      })}
                      onCheckedChange={() => void handleToggleActive(banner)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormTarget(banner)}
                      >
                        {tShared("edit")}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          // A failure from an earlier toggle must not follow
                          // the admin into this confirmation.
                          setActionError(null);
                          setDeleteTarget(banner);
                        }}
                      >
                        {tShared("delete")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {formTarget !== undefined ? (
        <BannerFormDialog
          // Keyed by banner so the form starts from the right values for each
          // one (and empty for a new banner), without an effect to resync them.
          key={formTarget?.id ?? "new"}
          banner={formTarget}
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
            // through here; none of them should interrupt a delete already in
            // flight.
            if (!open && pendingId === null) {
              setDeleteTarget(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("deleteBanner")}</DialogTitle>
              <DialogDescription>
                {t("deleteBannerDescription", {
                  title: deleteTarget.title || t("untitled"),
                  placement: deleteTarget.placement,
                })}
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
                disabled={pendingId !== null}
              >
                {tShared("cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pendingId !== null}
                onClick={() => void handleDelete(deleteTarget)}
              >
                {pendingId === deleteTarget.id
                  ? tShared("deleting")
                  : t("deleteBanner")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
