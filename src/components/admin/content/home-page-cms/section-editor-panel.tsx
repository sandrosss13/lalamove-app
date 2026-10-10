"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type { ContentLocale } from "@prisma/client";

import type { AdminHomePageSectionRow } from "@/app/api/admin/content/home-page-sections/route";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_HOME_PAGE_CONTENT,
  isHomePageSectionType,
  parseHomePageSection,
  type HomePageSectionData,
  type HomePageSectionType,
} from "@/lib/admin/home-page-content";

import { BannerListEditor, type BannerListKind } from "./banner-list-editor";
import type { ConfirmRequest } from "./confirm-dialog";
import { SectionContentFields } from "./section-content-fields";
import {
  SECTIONS_ENDPOINT,
  SECTION_TYPE_LABEL_KEYS,
  isEditableV4Type,
  readErrorMessage,
  type CmsBanner,
} from "./shared";

/** Which inline banner list, if any, each section type owns. */
const BANNER_LIST_FOR_TYPE: Partial<
  Record<HomePageSectionType, BannerListKind>
> = {
  hero_carousel: "hero",
  offers: "offers",
  partner_marquee: "logos",
};

/**
 * The row's content as an editable draft.
 *
 * A row whose stored content no longer matches its type (hand-edited in the
 * database, or written before a shape changed) opens on the built-in defaults
 * rather than refusing to render, so it can be repaired here; `recovered`
 * flags it so the editor can say so.
 */
function initialDraft(
  row: AdminHomePageSectionRow,
): { data: HomePageSectionData; recovered: boolean } | null {
  const parsed = parseHomePageSection(row.type, row.content);

  if (!("error" in parsed)) {
    return { data: parsed.data, recovered: false };
  }

  if (!isHomePageSectionType(row.type)) {
    return null;
  }

  // Built per type rather than indexed generically so the pair stays a member
  // of the discriminated union the editors switch on.
  const type: HomePageSectionType = row.type;
  const data = {
    type,
    content: DEFAULT_HOME_PAGE_CONTENT[type],
  } as HomePageSectionData;

  return { data, recovered: true };
}

export type SectionEditorPanelProps = {
  section: AdminHomePageSectionRow;
  /** Display name of the section, already translated. */
  label: string;
  locale: ContentLocale;
  /** Banners of this locale, grouped by placement — each list takes its own. */
  bannersByPlacement: Record<BannerListKind, CmsBanner[]>;
  onSaved: (section: AdminHomePageSectionRow) => void;
  onBannersChanged: () => Promise<void>;
  /** Reports unsaved edits, so the page can confirm before navigating away. */
  onDirtyChange: (dirty: boolean) => void;
  requestConfirm: (request: ConfirmRequest) => void;
};

/**
 * The right-hand pane of the CMS: one section's header (name, visibility,
 * description, type), its content fields and — for the hero, offers and partner
 * logos — its inline banner list.
 *
 * Content edits are held as a draft and written with Save, validated by the
 * same parser the API and the public page use, so a field the page cannot
 * render is named here instead of coming back as a 400. The parent keys this
 * component by row id and `updatedAt`, so after a save the draft restarts from
 * exactly what the server stored.
 */
export function SectionEditorPanel({
  section,
  label,
  locale,
  bannersByPlacement,
  onSaved,
  onBannersChanged,
  onDirtyChange,
  requestConfirm,
}: SectionEditorPanelProps) {
  const t = useTranslations("admin.homePageCms");
  const initial = useMemo(() => initialDraft(section), [section]);
  const [draft, setDraft] = useState<HomePageSectionData | null>(
    initial?.data ?? null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    initial !== null &&
    draft !== null &&
    (initial.recovered ||
      JSON.stringify(draft.content) !== JSON.stringify(initial.data.content));

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // A pane unmounting (another section selected, the locale switched) has no
  // unsaved edits left to protect.
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const typeKey = isEditableV4Type(section.type)
    ? SECTION_TYPE_LABEL_KEYS[section.type]
    : null;
  const bannerList = isHomePageSectionType(section.type)
    ? BANNER_LIST_FOR_TYPE[section.type]
    : undefined;

  async function handleSave() {
    if (draft === null) {
      return;
    }

    const validated = parseHomePageSection(draft.type, draft.content);
    if ("error" in validated) {
      setError(validated.error);
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`${SECTIONS_ENDPOINT}/${section.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Content only: visibility and order have their own controls in the
        // section list, and a content save must not overwrite them.
        body: JSON.stringify({ content: validated.data.content }),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response, t("couldNotSaveSection")));
        setPending(false);
        return;
      }

      const body = (await response.json()) as {
        section: AdminHomePageSectionRow;
      };
      // The parent re-keys this pane on the new `updatedAt`, which remounts it
      // with a clean draft — `pending` does not need resetting here.
      onSaved(body.section);
    } catch {
      setError(t("somethingWentWrong"));
      setPending(false);
    }
  }

  return (
    <div className="min-w-0 flex-[999_1_30rem] rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{label}</h2>
            <Badge variant={section.isActive ? "default" : "outline"}>
              {section.isActive ? t("visible") : t("hidden")}
            </Badge>
            {dirty ? (
              <Badge variant="secondary">{t("unsavedChanges")}</Badge>
            ) : null}
          </div>
          {typeKey ? (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t(`descriptions.${typeKey}`)}
            </p>
          ) : null}
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          {section.type}
        </span>
      </div>

      <div className="flex flex-col gap-5 p-5">
        {initial?.recovered ? (
          <p role="status" className="text-sm text-destructive">
            {t("contentRecovered")}
          </p>
        ) : null}

        {draft ? (
          <SectionContentFields data={draft} onChange={setDraft} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("notEditable")}</p>
        )}

        {draft ? (
          // Sticky so Save stays reachable below long lists (cities, FAQ).
          <div className="sticky bottom-0 z-10 -mx-5 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
            {error ? (
              <p role="alert" className="mr-auto text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!dirty || pending}
              onClick={() => {
                if (initial) {
                  setDraft(initial.data);
                }
                setError(null);
              }}
            >
              {t("discard")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!dirty || pending}
              onClick={() => void handleSave()}
            >
              {pending ? t("saving") : t("saveChanges")}
            </Button>
          </div>
        ) : null}

        {bannerList ? (
          <div className="border-t border-border pt-5">
            <BannerListEditor
              kind={bannerList}
              locale={locale}
              banners={bannersByPlacement[bannerList]}
              onChanged={onBannersChanged}
              requestConfirm={requestConfirm}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
