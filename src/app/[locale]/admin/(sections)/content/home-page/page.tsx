"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import type { ContentLocale } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time.
import type { AdminHomePageSectionRow } from "@/app/api/admin/content/home-page-sections/route";
import type { BannerListKind } from "@/components/admin/content/home-page-cms/banner-list-editor";
import {
  ConfirmDialog,
  type ConfirmRequest,
} from "@/components/admin/content/home-page-cms/confirm-dialog";
import { SectionEditorPanel } from "@/components/admin/content/home-page-cms/section-editor-panel";
import { SectionList } from "@/components/admin/content/home-page-cms/section-list";
import {
  BANNERS_ENDPOINT,
  SECTIONS_ENDPOINT,
  SECTION_TYPE_LABEL_KEYS,
  fingerprint,
  isEditableV4Type,
  isMissingV4Sections,
  moveAt,
  partitionSections,
  readErrorMessage,
  readSectionRows,
  toPathLocale,
  withPinnedUnderHero,
  type CmsBanner,
} from "@/components/admin/content/home-page-cms/shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  HERO_INTERVAL_DEFAULT,
  HOME_HERO_BANNER_PLACEMENT,
  HOME_PARTNER_LOGO_BANNER_PLACEMENT,
  HOME_SECONDARY_BANNER_PLACEMENT,
  PINNED_UNDER_HERO,
  isHomePageSectionType,
  parseHomePageSection,
} from "@/lib/admin/home-page-content";

/** Locale tabs, in the order the artboard offers them. */
const LOCALE_TABS: { value: ContentLocale; labelKey: string }[] = [
  { value: "KA", labelKey: "georgianKa" },
  { value: "EN", labelKey: "englishEn" },
];

/**
 * The locale the page opens on: English, as in the artboard — the copy authored
 * first, which the Georgian tab is then usually copied from.
 */
const DEFAULT_LOCALE: ContentLocale = "EN";

/** The placement each inline banner list reads. */
const PLACEMENT_FOR_LIST: Record<BannerListKind, string> = {
  hero: HOME_HERO_BANNER_PLACEMENT,
  offers: HOME_SECONDARY_BANNER_PLACEMENT,
  logos: HOME_PARTNER_LOGO_BANNER_PLACEMENT,
};

type View = "edit" | "preview";

/**
 * `/admin/content/home-page` — the v4 home page CMS.
 *
 * Two panes, per the "Admin - Home Page CMS" artboard: the page's sections in
 * running order on the left (visibility, ↑/↓, the booking card pinned under
 * the hero, header and footer fixed), and the selected section's editor — or a
 * live preview of the public page — on the right. Each locale is composed
 * separately.
 *
 * A client component over the admin API rather than a server component reading
 * Prisma: nearly everything here is a mutation whose result the panes must show
 * at once. The section layout gates *viewing*; every endpoint re-checks the
 * admin role on each request, which is the real boundary.
 */
export default function AdminHomePageCmsPage() {
  const t = useTranslations("admin.homePageCms");
  const tShared = useTranslations("common.shared");
  const tTypes = useTranslations("admin.homePageSectionTypes");
  const format = useFormatter();

  const [locale, setLocale] = useState<ContentLocale>(DEFAULT_LOCALE);
  const [view, setView] = useState<View>("edit");
  const [rows, setRows] = useState<AdminHomePageSectionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Non-fatal problems: a failed materialize, toggle or reorder. */
  const [notice, setNotice] = useState<string | null>(null);
  const [banners, setBanners] = useState<CmsBanner[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  /** Bumped after every write, to reload the preview iframe. */
  const [previewNonce, setPreviewNonce] = useState(0);
  /** Bumped to refetch the section list from scratch. */
  const [reloadToken, setReloadToken] = useState(0);

  const markPublished = useCallback(() => {
    setPreviewNonce((nonce) => nonce + 1);
  }, []);

  /**
   * Loads one locale's sections. When the locale is missing any v4 section
   * (a fresh locale, or one composed before v4), the server is asked to
   * materialize the defaults first, so every section of the page is listed
   * and editable here rather than only the authored ones.
   */
  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setLoadError(null);
    setNotice(null);

    async function load() {
      try {
        const response = await fetch(`${SECTIONS_ENDPOINT}?locale=${locale}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          setLoadError(
            await readErrorMessage(response, t("couldNotLoadSections")),
          );
          setLoading(false);
          return;
        }

        let loaded = readSectionRows(await response.json());

        if (isMissingV4Sections(loaded)) {
          const materialized = await fetch(`${SECTIONS_ENDPOINT}/materialize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locale }),
            signal: controller.signal,
          });

          if (materialized.ok) {
            loaded = readSectionRows(await materialized.json());
          } else {
            // Not fatal: the authored sections can still be edited.
            setNotice(
              await readErrorMessage(
                materialized,
                t("couldNotCreateMissingSections"),
              ),
            );
          }
        }

        setRows(loaded);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up by a newer load.
        if (controller.signal.aborted) {
          return;
        }

        setLoadError(t("couldNotLoadSections"));
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [locale, reloadToken, t]);

  /** Reloads every banner; the inline lists filter by locale and placement. */
  const loadBanners = useCallback(async () => {
    try {
      const response = await fetch(BANNERS_ENDPOINT);

      if (!response.ok) {
        setNotice(await readErrorMessage(response, t("couldNotLoadBanners")));
        return;
      }

      const body = (await response.json()) as { items: CmsBanner[] };
      setBanners(body.items);
    } catch {
      setNotice(t("couldNotLoadBanners"));
    }
  }, [t]);

  useEffect(() => {
    void loadBanners();
  }, [loadBanners]);

  const handleBannersChanged = useCallback(async () => {
    await loadBanners();
    markPublished();
  }, [loadBanners, markPublished]);

  const partitioned = useMemo(() => partitionSections(rows ?? []), [rows]);

  const bannersByPlacement = useMemo(() => {
    const forLocale = banners.filter((banner) => banner.locale === locale);
    const pick = (kind: BannerListKind) =>
      forLocale.filter(
        (banner) => banner.placement === PLACEMENT_FOR_LIST[kind],
      );

    return { hero: pick("hero"), offers: pick("offers"), logos: pick("logos") };
  }, [banners, locale]);

  // The selected section, falling back to the first one on the page (the hero)
  // when nothing is selected yet or the selection left with a locale switch.
  const selectableRows = useMemo(
    () =>
      [partitioned.nav, ...partitioned.body, partitioned.footer].filter(
        (row): row is AdminHomePageSectionRow => row !== null,
      ),
    [partitioned],
  );
  const selected =
    selectableRows.find((row) => row.id === selectedId) ??
    partitioned.body[0] ??
    null;

  /** Runs `action` now, or after confirming that unsaved edits may be lost. */
  const guardUnsaved = useCallback(
    (action: () => void) => {
      if (!dirty) {
        action();
        return;
      }

      setConfirm({
        title: t("discardChangesTitle"),
        description: t("discardChangesDescription"),
        confirmLabel: t("discardChanges"),
        destructive: true,
        onConfirm: () => {
          setDirty(false);
          action();
        },
      });
    },
    [dirty, t],
  );

  function labelFor(section: AdminHomePageSectionRow): string {
    if (isEditableV4Type(section.type)) {
      return t(`sectionNames.${SECTION_TYPE_LABEL_KEYS[section.type]}`);
    }

    if (isHomePageSectionType(section.type)) {
      return tTypes(SECTION_TYPE_LABEL_KEYS[section.type]);
    }

    return t("unrecognizedType", { type: section.type });
  }

  /** The one-line summary under each section's name, as in the artboard. */
  function summaryFor(section: AdminHomePageSectionRow): string {
    const parsed = parseHomePageSection(section.type, section.content);

    if ("error" in parsed) {
      return t("contentNeedsAttention");
    }

    switch (parsed.data.type) {
      case "hero_carousel": {
        const heroBanners = bannersByPlacement.hero;
        return t("summaryHero", {
          live: heroBanners.filter((banner) => banner.isActive).length,
          total: heroBanners.length,
          seconds: parsed.data.content.intervalSec ?? HERO_INTERVAL_DEFAULT,
        });
      }
      case "offers":
        return t("summaryOffers", { count: bannersByPlacement.offers.length });
      case "how_it_works":
        return t("summarySteps", { count: parsed.data.content.steps.length });
      case "coverage":
        return parsed.data.content.cities.map((city) => city.name).join(", ");
      case "partner_marquee":
        return t("summaryLogos", {
          count: bannersByPlacement.logos.filter((banner) => banner.isActive)
            .length,
        });
      case "faq":
        return t("summaryQuestions", {
          count: parsed.data.content.items.length,
        });
      case "quote_calculator":
      case "vehicle_types":
      case "closing_cta":
        return parsed.data.content.heading;
      case "nav":
        return parsed.data.content.links.map((link) => link.label).join(" · ");
      case "footer":
        return parsed.data.content.brandName;
      case "hero":
      case "stats":
      case "bento":
      case "driver_cta":
      case "category_tiles":
        return "";
    }
  }

  async function handleToggle(section: AdminHomePageSectionRow) {
    setBusy(true);
    setNotice(null);

    try {
      const response = await fetch(`${SECTIONS_ENDPOINT}/${section.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Partial on purpose: only visibility is being confirmed here.
        body: JSON.stringify({ isActive: !section.isActive }),
      });

      if (!response.ok) {
        setNotice(
          await readErrorMessage(response, t("couldNotUpdateVisibility")),
        );
        return;
      }

      const body = (await response.json()) as {
        section: AdminHomePageSectionRow;
      };
      setRows((current) =>
        (current ?? []).map((row) =>
          row.id === body.section.id ? body.section : row,
        ),
      );
      markPublished();
    } catch {
      setNotice(t("somethingWentWrong"));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Moves a section one place among the reorderable ones and writes the whole
   * order in one request. The booking card is re-inserted under the hero.
   */
  async function handleMove(
    section: AdminHomePageSectionRow,
    direction: -1 | 1,
  ) {
    const movable = partitioned.body.filter(
      (row) => row.type !== PINNED_UNDER_HERO,
    );
    const pinned = partitioned.body.filter(
      (row) => row.type === PINNED_UNDER_HERO,
    );
    const index = movable.findIndex((row) => row.id === section.id);
    const body = withPinnedUnderHero(moveAt(movable, index, direction), pinned);
    // Body ids only: the endpoint places the listed rows first and keeps every
    // omitted row (chrome, retired) after them in its existing order.
    const ids = body.map((row) => row.id);

    setBusy(true);
    setNotice(null);

    try {
      const response = await fetch(`${SECTIONS_ENDPOINT}/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, ids }),
      });

      if (!response.ok) {
        setNotice(
          await readErrorMessage(response, t("couldNotReorderSections")),
        );
        // The stored order may not be the one shown; refetch it.
        setReloadToken((token) => token + 1);
        return;
      }

      setRows(readSectionRows(await response.json()));
      markPublished();
    } catch {
      setNotice(t("somethingWentWrong"));
    } finally {
      setBusy(false);
    }
  }

  /** A bulk write answering `{ sections }` for this locale. */
  async function runBulk(
    path: string,
    payload: Record<string, unknown>,
    fallback: string,
  ): Promise<string | null> {
    const response = await fetch(`${SECTIONS_ENDPOINT}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return readErrorMessage(response, fallback);
    }

    setRows(readSectionRows(await response.json()));
    setDirty(false);
    await loadBanners();
    markPublished();
    return null;
  }

  const otherLocale: ContentLocale = locale === "KA" ? "EN" : "KA";

  function requestCopy() {
    setConfirm({
      title: t("copyTitle", { from: otherLocale, to: locale }),
      description: t("copyDescription", { from: otherLocale, to: locale }),
      confirmLabel: t("copyConfirm"),
      destructive: true,
      onConfirm: () =>
        runBulk(
          "copy-locale",
          { from: otherLocale, to: locale },
          t("couldNotCopy"),
        ),
    });
  }

  function requestRestore() {
    setConfirm({
      title: t("restoreTitle", { locale }),
      description: t("restoreDescription", { locale }),
      confirmLabel: t("restoreConfirm"),
      destructive: true,
      onConfirm: () =>
        runBulk("restore-defaults", { locale }, t("couldNotRestore")),
    });
  }

  function requestDeleteRetired(section: AdminHomePageSectionRow) {
    setConfirm({
      title: t("deleteRetiredTitle"),
      description: t("deleteRetiredDescription", { name: labelFor(section) }),
      confirmLabel: t("delete"),
      destructive: true,
      onConfirm: async () => {
        const response = await fetch(`${SECTIONS_ENDPOINT}/${section.id}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          return readErrorMessage(response, t("couldNotDeleteSection"));
        }

        setRows((current) =>
          (current ?? []).filter((row) => row.id !== section.id),
        );
        markPublished();
        return null;
      },
    });
  }

  // "Published · 14:05": the latest write to this locale's sections or
  // banners, since every save goes live at once.
  const lastPublished = useMemo(() => {
    const stamps = [
      ...(rows ?? []).map((row) => row.updatedAt),
      ...banners
        .filter((banner) => banner.locale === locale)
        .map((banner) => banner.updatedAt),
    ];

    return stamps.length === 0
      ? null
      : new Date(Math.max(...stamps.map((stamp) => Date.parse(stamp))));
  }, [rows, banners, locale]);

  const pathLocale = toPathLocale(locale);
  const handleDirtyChange = useCallback((next: boolean) => setDirty(next), []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("pageIntro")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {lastPublished
              ? t("publishedAt", {
                  time: format.dateTime(lastPublished, {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })
              : t("showingDefaults")}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rows === null}
            onClick={requestCopy}
          >
            {t("copyFrom", { locale: otherLocale })}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={rows === null}
            onClick={requestRestore}
          >
            {t("restoreDefaults")}
          </Button>
          <Button asChild size="sm">
            <a href={`/${pathLocale}`} target="_blank" rel="noreferrer">
              {t("openHomePage")} ↗
            </a>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={locale}
          onValueChange={(value) =>
            guardUnsaved(() => {
              setLocale(value as ContentLocale);
              setSelectedId(null);
            })
          }
        >
          <TabsList>
            {LOCALE_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tShared(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs
          value={view}
          onValueChange={(value) => guardUnsaved(() => setView(value as View))}
        >
          <TabsList>
            <TabsTrigger value="edit">{t("edit")}</TabsTrigger>
            <TabsTrigger value="preview">{t("livePreview")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {notice ? (
        <p role="alert" className="text-sm text-destructive">
          {notice}
        </p>
      ) : null}

      {loadError ? (
        <div className="rounded-xl border border-border px-4 py-10 text-center text-sm text-destructive">
          <span role="alert">{loadError}</span>
        </div>
      ) : loading && rows === null ? (
        <div className="rounded-xl border border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("loadingSections")}
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <SectionList
            sections={partitioned}
            selectedId={view === "edit" ? (selected?.id ?? null) : null}
            busy={busy || loading}
            labelFor={labelFor}
            summaryFor={summaryFor}
            onSelect={(section) =>
              guardUnsaved(() => {
                setSelectedId(section.id);
                setView("edit");
              })
            }
            onToggle={(section) => void handleToggle(section)}
            onMove={(section, direction) => void handleMove(section, direction)}
            onDeleteRetired={requestDeleteRetired}
          />

          {view === "edit" ? (
            selected ? (
              <SectionEditorPanel
                // Keyed by content, not `updatedAt`: a save remounts the pane
                // with a clean draft, while toggling visibility does not
                // discard edits in progress.
                key={`${locale}-${selected.id}-${fingerprint(selected.content)}`}
                section={selected}
                label={labelFor(selected)}
                locale={locale}
                bannersByPlacement={bannersByPlacement}
                onSaved={(saved) => {
                  setRows((current) =>
                    (current ?? []).map((row) =>
                      row.id === saved.id ? saved : row,
                    ),
                  );
                  markPublished();
                }}
                onBannersChanged={handleBannersChanged}
                onDirtyChange={handleDirtyChange}
                requestConfirm={setConfirm}
              />
            ) : (
              <div className="min-w-0 flex-[999_1_30rem] rounded-xl border border-border px-4 py-10 text-center text-sm text-muted-foreground">
                {t("noSections")}
              </div>
            )
          ) : (
            <div className="min-w-0 flex-[999_1_30rem] overflow-hidden rounded-xl border border-border bg-muted">
              <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-3.5 py-2.5 text-xs text-muted-foreground">
                <span>{t("previewCaption")}</span>
                <span className="font-mono whitespace-nowrap">
                  1280px · 50%
                </span>
              </div>
              {/* The public page rendered at desktop width and scaled to half,
                  as in the artboard; reloaded after every write. */}
              <div className="h-[760px] overflow-auto">
                <div className="mx-auto h-[1700px] w-[640px] overflow-hidden">
                  <iframe
                    key={`${pathLocale}-${previewNonce}`}
                    src={`/${pathLocale}`}
                    title={t("previewTitle")}
                    className="h-[3400px] w-[1280px] origin-top-left scale-50 border-0 bg-white"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {confirm ? (
        <ConfirmDialog
          key={confirm.title}
          request={confirm}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}
