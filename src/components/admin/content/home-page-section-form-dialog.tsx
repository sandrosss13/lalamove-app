"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { ContentLocale } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the form and the
// API drifting apart.
import type { AdminHomePageSectionRow } from "@/app/api/admin/content/home-page-sections/route";
import { AdminImageUpload } from "@/components/admin/content/admin-image-upload";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_HOME_PAGE_CONTENT,
  HOME_HERO_BANNER_PLACEMENT,
  HOME_PAGE_SECTION_TYPES,
  HOME_PARTNER_LOGO_BANNER_PLACEMENT,
  MAX_HERO_BANNERS,
  parseHomePageSection,
  type HomePageSectionContent,
  type HomePageSectionContentByType,
  type HomePageSectionType,
  type VehicleTypesBusinessPanel,
} from "@/lib/admin/home-page-content";

/** Matches the bounds both section routes enforce, so the form fails first. */
const MIN_SORT_ORDER = 0;
const MAX_SORT_ORDER = 9999;

/**
 * Bounds on the bento tracking panel's progress bar — the only non-string field
 * in the whole content contract. Restated from the shared parser's own range so
 * a bad value is named in this form rather than coming back as a 400.
 */
const MIN_PROGRESS_PERCENT = 0;
const MAX_PROGRESS_PERCENT = 100;

/**
 * Where the driver photograph is filed in the media bucket.
 *
 * `banners` rather than a prefix of its own: `SiteMediaPurpose` is a closed
 * union owned by the media-upload module, and the driver panel's photograph is
 * page imagery uploaded from the content admin exactly like a banner is. Adding
 * a fourth prefix for one field would be a change to that module for no
 * organisational gain.
 */
const DRIVER_IMAGE_PURPOSE = "banners";

export type HomePageSectionFormDialogProps = {
  /** The section being edited, or null to create a new one. */
  section: AdminHomePageSectionRow | null;
  /** Locale the new section belongs to — the tab the admin is composing. */
  locale: ContentLocale;
  /** Where a new section lands in the running order: after the last one. */
  nextSortOrder: number;
  /** Dismissed without saving — the parent drops its target. */
  onClose: () => void;
  /** The section was created or updated; the parent should reload its list. */
  onCompleted: () => void;
};

/**
 * Pulls the API's `{ error }` message out of a failed response so staff see
 * *why* a save was refused (an empty field, a role that may not edit content)
 * rather than a generic failure.
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

/** Replaces one entry of a repeatable list, leaving the rest untouched. */
function replaceAt<Item>(items: Item[], index: number, next: Item): Item[] {
  return items.map((item, itemIndex) => (itemIndex === index ? next : item));
}

/** Drops one entry of a repeatable list. */
function removeAt<Item>(items: Item[], index: number): Item[] {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

/**
 * Moves one entry of a repeatable list by one position. Returns the list
 * unchanged when the move would run off either end, so the caller does not have
 * to bounds-check before calling.
 */
function moveAt<Item>(items: Item[], index: number, direction: -1 | 1): Item[] {
  const target = index + direction;

  if (target < 0 || target >= items.length) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(index, 1);
  // `splice` on an in-range index always removes one element; the guard is what
  // says so to the compiler, which types the read as possibly undefined.
  if (moved === undefined) {
    return items;
  }
  next.splice(target, 0, moved);

  return next;
}

/** A labelled single-line field. */
/**
 * Each section type's name in the admin picker, as a message path under
 * `admin.homePageSectionTypes` (the type in camelCase).
 */
function sectionTypeLabelKey(type: HomePageSectionType): string {
  const camel = type.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );

  return `admin.homePageSectionTypes.${camel}`;
}

function TextField({
  id,
  label,
  value,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  hint?: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A labelled multi-line field, for body copy. */
function TextAreaField({
  id,
  label,
  value,
  rows = 3,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  rows?: number;
  hint?: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Framing for one entry of a repeatable list, with its reorder and remove
 * controls. The entry's own fields are passed in, since they differ per section
 * type.
 *
 * `onMoveUp`/`onMoveDown` are each omitted at the end of the list they cannot
 * move towards, which is what renders that arrow `disabled` — several of these
 * lists are order-significant (stats read left to right, nav links and footer
 * columns read in order), so the position is content, not presentation. A list
 * of one passes neither and gets no arrows at all, which is the honest state:
 * there is nowhere for its single entry to go.
 *
 * The move buttons take their `aria-label` from `title`, which already names
 * the entry and its position ("Stat 2", "Column 1 link 3") — a page with eight
 * of these lists cannot afford eight identical "Move up" buttons.
 */
function RepeatableEntry({
  title,
  onMoveUp,
  onMoveDown,
  onRemove,
  children,
}: {
  title: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const reorderable = onMoveUp !== undefined || onMoveDown !== undefined;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          {title}
        </span>
        <div className="flex items-center gap-1">
          {reorderable ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={onMoveUp === undefined}
                aria-label={t("admin.homePageSectionFormDialog.moveUp", {
                  title,
                })}
                onClick={onMoveUp}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={onMoveDown === undefined}
                aria-label={t("admin.homePageSectionFormDialog.moveDown", {
                  title,
                })}
                onClick={onMoveDown}
              >
                ↓
              </Button>
            </>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            {t("common.shared.remove")}
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * The create/edit form for a `HomePageSection`, shared by the "New Section"
 * button and every row's Edit action so both write exactly the same fields.
 *
 * The `content` sub-form switches on the selected type, because each type's
 * component needs different props — the shapes and their defaults both come
 * from `@/lib/admin/home-page-content`, the same module the public renderer
 * validates against, so the form can only produce content that page can render.
 *
 * A draft is held per type rather than one shared object, so flipping the type
 * picker to look at another shape and back does not discard what was typed.
 * With fifteen types that is one record keyed by type rather than fifteen
 * `useState` calls, but the behaviour it exists for is unchanged.
 *
 * It holds no `open` state. The parent mounts it only while a section (or an
 * explicit "new") is selected, keyed by that target, so the fields start from
 * the right values for every section instead of needing an effect to resync
 * them — closing is the parent dropping its target, which is also what
 * `onOpenChange` reports here.
 */
export function HomePageSectionFormDialog({
  section,
  locale,
  nextSortOrder,
  onClose,
  onCompleted,
}: HomePageSectionFormDialogProps) {
  const t = useTranslations();
  const isEditing = section !== null;

  // Parsed once: a row whose stored content does not match its type (hand-edited
  // in the database, or written before a shape changed) is treated as "no
  // existing content", so the form opens on the defaults instead of refusing to
  // render and leaving the row uneditable.
  const parsedExisting = section
    ? parseHomePageSection(section.type, section.content)
    : null;
  const existing =
    parsedExisting && !("error" in parsedExisting) ? parsedExisting.data : null;

  const [type, setType] = useState<HomePageSectionType>(
    existing?.type ?? "hero",
  );
  // Kept as a string so the box can be cleared while typing; parsed on submit.
  const [sortOrder, setSortOrder] = useState(
    String(section?.sortOrder ?? nextSortOrder),
  );
  const [isActive, setIsActive] = useState(section?.isActive ?? true);

  // One draft per type, built once per mount — the parent already keys this
  // dialog by target, so a different row is a different mount.
  const [drafts, setDrafts] = useState<HomePageSectionContentByType>(() => ({
    ...DEFAULT_HOME_PAGE_CONTENT,
    // The row being edited overrides only its own type's draft; every other
    // type starts from the copy currently on the public page, so a new section
    // is pre-filled with something real to edit rather than empty boxes.
    ...(existing === null ? null : { [existing.type]: existing.content }),
  }));

  // The bento progress bar is the one numeric field in the contract, so it is
  // held as a string for the same reason `sortOrder` is: an `<input
  // type="number">` has to be clearable while it is being retyped, and "" is
  // not a number. Recovered in `handleSubmit`.
  const [progressPercent, setProgressPercent] = useState(
    String(
      (existing?.type === "bento"
        ? existing.content
        : DEFAULT_HOME_PAGE_CONTENT.bento
      ).trackingPanel.progressPercent,
    ),
  );

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Replaces one type's draft, leaving every other type's untouched. */
  function updateDraft<Type extends HomePageSectionType>(
    type: Type,
    next: HomePageSectionContentByType[Type],
  ) {
    setDrafts((current) => ({ ...current, [type]: next }));
  }

  /**
   * A setter bound to one type's draft.
   *
   * Each sub-form below then reads `setHero({ ...hero, eyebrow })`, exactly as
   * it did when every type had a `useState` of its own: holding the drafts in
   * one record is how they are stored, not something each of the form's ~90
   * fields should have to spell out.
   */
  function draftSetter<Type extends HomePageSectionType>(type: Type) {
    return (next: HomePageSectionContentByType[Type]) =>
      updateDraft(type, next);
  }

  const {
    hero,
    hero_carousel: heroCarousel,
    partner_marquee: partnerMarquee,
    stats,
    bento,
    quote_calculator: quoteCalculator,
    how_it_works: howItWorks,
    vehicle_types: vehicleTypes,
    driver_cta: driverCta,
    coverage,
    faq,
    closing_cta: closingCta,
    category_tiles: categoryTiles,
    nav,
    footer,
  } = drafts;

  const setHero = draftSetter("hero");
  const setHeroCarousel = draftSetter("hero_carousel");
  const setPartnerMarquee = draftSetter("partner_marquee");
  const setStats = draftSetter("stats");
  const setBento = draftSetter("bento");
  const setQuoteCalculator = draftSetter("quote_calculator");
  const setHowItWorks = draftSetter("how_it_works");
  const setVehicleTypes = draftSetter("vehicle_types");
  const setDriverCta = draftSetter("driver_cta");
  const setCoverage = draftSetter("coverage");
  const setFaq = draftSetter("faq");
  const setClosingCta = draftSetter("closing_cta");
  const setCategoryTiles = draftSetter("category_tiles");
  const setNav = draftSetter("nav");
  const setFooter = draftSetter("footer");

  /**
   * The fleet section's business panel with one field replaced.
   *
   * The panel is optional as a whole, so a draft may carry no panel at all —
   * editing any one of its boxes has to materialise the other three as empty
   * strings rather than writing a half-object the parser would reject. If all
   * four are then left blank, `currentContent` drops the panel again.
   */
  function withBusinessPanel(
    next: Partial<VehicleTypesBusinessPanel>,
  ): VehicleTypesBusinessPanel {
    return {
      title: "",
      body: "",
      ctaLabel: "",
      ctaHref: "",
      ...vehicleTypes.businessPanel,
      ...next,
    };
  }

  /**
   * The draft belonging to the type currently selected, with the corrections
   * the drafts cannot carry themselves applied.
   *
   * Returns the message to show instead when a value cannot be recovered, so a
   * bad progress percentage is named against its own field rather than arriving
   * as the parser's generic complaint about `bento.trackingPanel`.
   */
  function currentContent():
    | { content: HomePageSectionContent }
    | {
        error: string;
      } {
    if (type === "hero") {
      // `headlineHighlight` is retired, so it has no field in this form. Blanked
      // rather than carried, because the shared parser drops a blank optional
      // string and stores what it returns: saving an old hero row through here
      // therefore retires the value instead of ferrying a string nothing renders
      // forward forever. That is the intended retirement path, not an oversight.
      return { content: { ...hero, headlineHighlight: "" } };
    }

    if (type === "bento") {
      const parsed = Number.parseInt(progressPercent, 10);

      if (
        !Number.isInteger(parsed) ||
        parsed < MIN_PROGRESS_PERCENT ||
        parsed > MAX_PROGRESS_PERCENT
      ) {
        return {
          error: t(
            "admin.homePageSectionFormDialog.progressWholeNumberBetween",
            {
              min: MIN_PROGRESS_PERCENT,
              max: MAX_PROGRESS_PERCENT,
            },
          ),
        };
      }

      return {
        content: {
          ...bento,
          trackingPanel: { ...bento.trackingPanel, progressPercent: parsed },
        },
      };
    }

    if (type === "vehicle_types") {
      const panel = vehicleTypes.businessPanel;
      const panelIsEmpty =
        panel === undefined ||
        [panel.title, panel.body, panel.ctaLabel, panel.ctaHref].every(
          (value) => value.trim() === "",
        );

      // The panel is optional as a whole but every field inside it is required,
      // so an editor who cleared all four means "no panel" — sending it as four
      // empty strings would be rejected instead. `undefined` is the parser's own
      // spelling of an absent panel, and it does not survive `JSON.stringify`,
      // so neither the request nor the stored column carries the key.
      if (panelIsEmpty) {
        return { content: { ...vehicleTypes, businessPanel: undefined } };
      }

      return { content: vehicleTypes };
    }

    return { content: drafts[type] };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Checked here as well as server-side purely for the faster feedback; the
    // routes are what actually enforce these.
    const parsedSortOrder = Number.parseInt(sortOrder, 10);
    if (
      !Number.isInteger(parsedSortOrder) ||
      parsedSortOrder < MIN_SORT_ORDER ||
      parsedSortOrder > MAX_SORT_ORDER
    ) {
      setError(
        t("common.shared.sortOrderWholeNumberBetween", {
          min: MIN_SORT_ORDER,
          max: MAX_SORT_ORDER,
        }),
      );
      return;
    }

    const prepared = currentContent();
    if ("error" in prepared) {
      setError(prepared.error);
      return;
    }

    const { content } = prepared;

    // The same validator the API and the public renderer use, so an empty field
    // is named here instead of coming back as a 400.
    const validated = parseHomePageSection(type, content);
    if ("error" in validated) {
      setError(validated.error);
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        isEditing
          ? `/api/admin/content/home-page-sections/${section.id}`
          : "/api/admin/content/home-page-sections",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            // Locale is the tab being composed, not a field: an edit leaves it
            // alone rather than risking a section hopping between locales.
            ...(isEditing ? {} : { locale }),
            sortOrder: parsedSortOrder,
            isActive,
            content,
          }),
        },
      );

      if (!response.ok) {
        setError(
          await readErrorMessage(
            response,
            isEditing
              ? t("admin.homePageSectionFormDialog.couldNotSave")
              : t("admin.homePageSectionFormDialog.couldNotCreate"),
          ),
        );
        return;
      }

      onCompleted();
    } catch {
      setError(t("common.shared.networkErrorPleaseCheckYourConnection"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Radix reports Escape, the overlay and the close button all through
        // here; none of them should interrupt a save already in flight.
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      {/* Widened from `sm:max-w-2xl` for the footer sub-form, whose nested
          column → link rows are cramped at the narrower width. The height cap
          is what keeps the dialog scrollable rather than taller than the
          viewport, so it stays. */}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>
              {isEditing
                ? t("admin.homePageSectionFormDialog.editSection")
                : t("admin.homePageSectionFormDialog.newSection")}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? t("admin.homePageSectionFormDialog.editDescription")
                : t("admin.homePageSectionFormDialog.newDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="section-type">
                {t("admin.homePageSectionFormDialog.sectionType")}
              </Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as HomePageSectionType)}
              >
                <SelectTrigger id="section-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOME_PAGE_SECTION_TYPES.map((sectionType) => (
                    <SelectItem key={sectionType} value={sectionType}>
                      {t(sectionTypeLabelKey(sectionType))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t(
                  "admin.homePageSectionFormDialog.theTypeDecidesWhichLandingComponent",
                )}
              </p>
            </div>

            {type === "hero" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="hero-eyebrow"
                  label={t("admin.homePageSectionFormDialog.eyebrow")}
                  value={hero.eyebrow}
                  onChange={(eyebrow) => setHero({ ...hero, eyebrow })}
                />
                <TextField
                  id="hero-headline"
                  label={t("admin.homePageSectionFormDialog.headline")}
                  value={hero.headline}
                  onChange={(headline) => setHero({ ...hero, headline })}
                />
                <TextAreaField
                  id="hero-subtext"
                  label={t("admin.homePageSectionFormDialog.subtext")}
                  rows={4}
                  value={hero.subtext}
                  onChange={(subtext) => setHero({ ...hero, subtext })}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id="hero-status-chip-text"
                    label={t("admin.homePageSectionFormDialog.statusChipText")}
                    value={hero.statusChipText ?? ""}
                    onChange={(statusChipText) =>
                      setHero({ ...hero, statusChipText })
                    }
                  />
                  <TextField
                    id="hero-status-chip-tag"
                    label={t("admin.homePageSectionFormDialog.statusChipTag")}
                    hint={t(
                      "admin.homePageSectionFormDialog.chipFieldsOptional",
                    )}
                    value={hero.statusChipTag ?? ""}
                    onChange={(statusChipTag) =>
                      setHero({ ...hero, statusChipTag })
                    }
                  />
                  <TextField
                    id="hero-primary-cta-label"
                    label={t(
                      "admin.homePageSectionFormDialog.primaryButtonLabel",
                    )}
                    value={hero.primaryCtaLabel}
                    onChange={(primaryCtaLabel) =>
                      setHero({ ...hero, primaryCtaLabel })
                    }
                  />
                  <TextField
                    id="hero-primary-cta-href"
                    label={t(
                      "admin.homePageSectionFormDialog.primaryButtonLink",
                    )}
                    value={hero.primaryCtaHref}
                    onChange={(primaryCtaHref) =>
                      setHero({ ...hero, primaryCtaHref })
                    }
                  />
                  <TextField
                    id="hero-secondary-cta-label"
                    label={t(
                      "admin.homePageSectionFormDialog.secondaryButtonLabel",
                    )}
                    value={hero.secondaryCtaLabel}
                    onChange={(secondaryCtaLabel) =>
                      setHero({ ...hero, secondaryCtaLabel })
                    }
                  />
                  <TextField
                    id="hero-secondary-cta-href"
                    label={t(
                      "admin.homePageSectionFormDialog.secondaryButtonLink",
                    )}
                    value={hero.secondaryCtaHref}
                    onChange={(secondaryCtaHref) =>
                      setHero({ ...hero, secondaryCtaHref })
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "admin.homePageSectionFormDialog.theFiguresBelowTheHeroAre",
                  )}
                </p>
              </div>
            ) : null}

            {type === "hero_carousel" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="carousel-fallback-caption"
                  label={t("admin.homePageSectionFormDialog.fallbackCaption")}
                  hint={t(
                    "admin.homePageSectionFormDialog.optionalUsedForASlideWhose",
                  )}
                  value={heroCarousel.fallbackCaption ?? ""}
                  onChange={(fallbackCaption) =>
                    setHeroCarousel({ ...heroCarousel, fallbackCaption })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t.rich(
                    "admin.homePageSectionFormDialog.carouselSlidesHint",
                    {
                      placement: HOME_HERO_BANNER_PLACEMENT,
                      max: MAX_HERO_BANNERS,
                      code: (chunks) => (
                        <span className="font-mono">{chunks}</span>
                      ),
                    },
                  )}
                </p>
              </div>
            ) : null}

            {type === "partner_marquee" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="marquee-eyebrow"
                  label={t("admin.homePageSectionFormDialog.eyebrow")}
                  value={partnerMarquee.eyebrow}
                  onChange={(eyebrow) =>
                    setPartnerMarquee({ ...partnerMarquee, eyebrow })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t.rich("admin.homePageSectionFormDialog.marqueeLogosHint", {
                    placement: HOME_PARTNER_LOGO_BANNER_PLACEMENT,
                    code: (chunks) => (
                      <span className="font-mono">{chunks}</span>
                    ),
                  })}
                </p>
              </div>
            ) : null}

            {type === "stats" ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {t("admin.homePageSectionFormDialog.tiles")}
                  </span>
                  {stats.items.map((item, index) => (
                    <RepeatableEntry
                      // Position: two tiles may share a label, and the list is
                      // only ever edited through these controls.
                      key={index}
                      title={t("admin.homePageSectionFormDialog.statTitle", {
                        number: index + 1,
                      })}
                      onMoveUp={
                        index === 0
                          ? undefined
                          : () =>
                              setStats({
                                items: moveAt(stats.items, index, -1),
                              })
                      }
                      onMoveDown={
                        index === stats.items.length - 1
                          ? undefined
                          : () =>
                              setStats({
                                items: moveAt(stats.items, index, 1),
                              })
                      }
                      onRemove={() =>
                        setStats({ items: removeAt(stats.items, index) })
                      }
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TextField
                          id={`stat-value-${index}`}
                          label={t("common.shared.value")}
                          value={item.value}
                          onChange={(value) =>
                            setStats({
                              items: replaceAt(stats.items, index, {
                                ...item,
                                value,
                              }),
                            })
                          }
                        />
                        <TextField
                          id={`stat-label-${index}`}
                          label={t("admin.homePageSectionFormDialog.label")}
                          value={item.label}
                          onChange={(label) =>
                            setStats({
                              items: replaceAt(stats.items, index, {
                                ...item,
                                label,
                              }),
                            })
                          }
                        />
                      </div>
                    </RepeatableEntry>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      setStats({
                        items: [...stats.items, { value: "", label: "" }],
                      })
                    }
                  >
                    {t("admin.homePageSectionFormDialog.addStat")}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.homePageSectionFormDialog.tilesOrderHint")}
                  </p>
                </div>
              </div>
            ) : null}

            {type === "bento" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="bento-eyebrow"
                  label={t("admin.homePageSectionFormDialog.eyebrow")}
                  value={bento.eyebrow}
                  onChange={(eyebrow) => setBento({ ...bento, eyebrow })}
                />
                <TextField
                  id="bento-heading"
                  label={t("admin.homePageSectionFormDialog.heading")}
                  value={bento.heading}
                  onChange={(heading) => setBento({ ...bento, heading })}
                />
                <TextAreaField
                  id="bento-body"
                  label={t("common.shared.body")}
                  rows={4}
                  value={bento.body}
                  onChange={(body) => setBento({ ...bento, body })}
                />

                <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                  <span className="text-sm font-medium">
                    {t("admin.homePageSectionFormDialog.trackingPanel")}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "admin.homePageSectionFormDialog.theMockOrderPinnedToThe",
                    )}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField
                      id="bento-order-label"
                      label={t("admin.homePageSectionFormDialog.orderLabel")}
                      value={bento.trackingPanel.orderLabel}
                      onChange={(orderLabel) =>
                        setBento({
                          ...bento,
                          trackingPanel: {
                            ...bento.trackingPanel,
                            orderLabel,
                          },
                        })
                      }
                    />
                    <TextField
                      id="bento-eta-label"
                      label={t("admin.homePageSectionFormDialog.etaLabel")}
                      value={bento.trackingPanel.etaLabel}
                      onChange={(etaLabel) =>
                        setBento({
                          ...bento,
                          trackingPanel: { ...bento.trackingPanel, etaLabel },
                        })
                      }
                    />
                    <TextField
                      id="bento-from-label"
                      label={t("admin.homePageSectionFormDialog.fromLabel")}
                      value={bento.trackingPanel.fromLabel}
                      onChange={(fromLabel) =>
                        setBento({
                          ...bento,
                          trackingPanel: { ...bento.trackingPanel, fromLabel },
                        })
                      }
                    />
                    <TextField
                      id="bento-to-label"
                      label={t("admin.homePageSectionFormDialog.toLabel")}
                      value={bento.trackingPanel.toLabel}
                      onChange={(toLabel) =>
                        setBento({
                          ...bento,
                          trackingPanel: { ...bento.trackingPanel, toLabel },
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="bento-progress-percent">
                      {t("admin.homePageSectionFormDialog.progressPercent")}
                    </Label>
                    <Input
                      id="bento-progress-percent"
                      type="number"
                      inputMode="numeric"
                      min={MIN_PROGRESS_PERCENT}
                      max={MAX_PROGRESS_PERCENT}
                      step={1}
                      value={progressPercent}
                      onChange={(event) =>
                        setProgressPercent(event.target.value)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("admin.homePageSectionFormDialog.progressHint", {
                        min: MIN_PROGRESS_PERCENT,
                        max: MAX_PROGRESS_PERCENT,
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {t("admin.homePageSectionFormDialog.sideCards")}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "admin.homePageSectionFormDialog.rowATheColumnBesideThe",
                    )}
                  </p>
                  {bento.sideCards.map((card, index) => (
                    <RepeatableEntry
                      key={index}
                      title={t(
                        "admin.homePageSectionFormDialog.sideCardTitle",
                        { number: index + 1 },
                      )}
                      onMoveUp={
                        index === 0
                          ? undefined
                          : () =>
                              setBento({
                                ...bento,
                                sideCards: moveAt(bento.sideCards, index, -1),
                              })
                      }
                      onMoveDown={
                        index === bento.sideCards.length - 1
                          ? undefined
                          : () =>
                              setBento({
                                ...bento,
                                sideCards: moveAt(bento.sideCards, index, 1),
                              })
                      }
                      onRemove={() =>
                        setBento({
                          ...bento,
                          sideCards: removeAt(bento.sideCards, index),
                        })
                      }
                    >
                      <TextField
                        id={`bento-side-card-${index}-eyebrow`}
                        label={t("admin.homePageSectionFormDialog.eyebrow")}
                        value={card.eyebrow}
                        onChange={(eyebrow) =>
                          setBento({
                            ...bento,
                            sideCards: replaceAt(bento.sideCards, index, {
                              ...card,
                              eyebrow,
                            }),
                          })
                        }
                      />
                      <TextField
                        id={`bento-side-card-${index}-title`}
                        label={t("common.shared.title")}
                        value={card.title}
                        onChange={(title) =>
                          setBento({
                            ...bento,
                            sideCards: replaceAt(bento.sideCards, index, {
                              ...card,
                              title,
                            }),
                          })
                        }
                      />
                      <TextAreaField
                        id={`bento-side-card-${index}-body`}
                        label={t("common.shared.body")}
                        value={card.body}
                        onChange={(body) =>
                          setBento({
                            ...bento,
                            sideCards: replaceAt(bento.sideCards, index, {
                              ...card,
                              body,
                            }),
                          })
                        }
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TextField
                          id={`bento-side-card-${index}-link-label`}
                          label={t("admin.homePageSectionFormDialog.linkLabel")}
                          value={card.linkLabel ?? ""}
                          onChange={(linkLabel) =>
                            setBento({
                              ...bento,
                              sideCards: replaceAt(bento.sideCards, index, {
                                ...card,
                                linkLabel,
                              }),
                            })
                          }
                        />
                        <TextField
                          id={`bento-side-card-${index}-link-href`}
                          label={t("common.shared.linkUrl")}
                          hint={t(
                            "admin.homePageSectionFormDialog.optionalMostCardsNoLink",
                          )}
                          value={card.linkHref ?? ""}
                          onChange={(linkHref) =>
                            setBento({
                              ...bento,
                              sideCards: replaceAt(bento.sideCards, index, {
                                ...card,
                                linkHref,
                              }),
                            })
                          }
                        />
                      </div>
                    </RepeatableEntry>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      setBento({
                        ...bento,
                        sideCards: [
                          ...bento.sideCards,
                          { eyebrow: "", title: "", body: "" },
                        ],
                      })
                    }
                  >
                    {t("admin.homePageSectionFormDialog.addSideCard")}
                  </Button>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {t("admin.homePageSectionFormDialog.rowCards")}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "admin.homePageSectionFormDialog.rowBAcrossTheFullWidth",
                    )}
                  </p>
                  {bento.rowCards.map((card, index) => (
                    <RepeatableEntry
                      key={index}
                      title={t("admin.homePageSectionFormDialog.rowCardTitle", {
                        number: index + 1,
                      })}
                      onMoveUp={
                        index === 0
                          ? undefined
                          : () =>
                              setBento({
                                ...bento,
                                rowCards: moveAt(bento.rowCards, index, -1),
                              })
                      }
                      onMoveDown={
                        index === bento.rowCards.length - 1
                          ? undefined
                          : () =>
                              setBento({
                                ...bento,
                                rowCards: moveAt(bento.rowCards, index, 1),
                              })
                      }
                      onRemove={() =>
                        setBento({
                          ...bento,
                          rowCards: removeAt(bento.rowCards, index),
                        })
                      }
                    >
                      <TextField
                        id={`bento-row-card-${index}-eyebrow`}
                        label={t("admin.homePageSectionFormDialog.eyebrow")}
                        value={card.eyebrow}
                        onChange={(eyebrow) =>
                          setBento({
                            ...bento,
                            rowCards: replaceAt(bento.rowCards, index, {
                              ...card,
                              eyebrow,
                            }),
                          })
                        }
                      />
                      <TextField
                        id={`bento-row-card-${index}-title`}
                        label={t("common.shared.title")}
                        value={card.title}
                        onChange={(title) =>
                          setBento({
                            ...bento,
                            rowCards: replaceAt(bento.rowCards, index, {
                              ...card,
                              title,
                            }),
                          })
                        }
                      />
                      <TextAreaField
                        id={`bento-row-card-${index}-body`}
                        label={t("common.shared.body")}
                        value={card.body}
                        onChange={(body) =>
                          setBento({
                            ...bento,
                            rowCards: replaceAt(bento.rowCards, index, {
                              ...card,
                              body,
                            }),
                          })
                        }
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TextField
                          id={`bento-row-card-${index}-link-label`}
                          label={t("admin.homePageSectionFormDialog.linkLabel")}
                          value={card.linkLabel ?? ""}
                          onChange={(linkLabel) =>
                            setBento({
                              ...bento,
                              rowCards: replaceAt(bento.rowCards, index, {
                                ...card,
                                linkLabel,
                              }),
                            })
                          }
                        />
                        <TextField
                          id={`bento-row-card-${index}-link-href`}
                          label={t("common.shared.linkUrl")}
                          hint={t(
                            "admin.homePageSectionFormDialog.optionalMostCardsNoLink",
                          )}
                          value={card.linkHref ?? ""}
                          onChange={(linkHref) =>
                            setBento({
                              ...bento,
                              rowCards: replaceAt(bento.rowCards, index, {
                                ...card,
                                linkHref,
                              }),
                            })
                          }
                        />
                      </div>
                    </RepeatableEntry>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      setBento({
                        ...bento,
                        rowCards: [
                          ...bento.rowCards,
                          { eyebrow: "", title: "", body: "" },
                        ],
                      })
                    }
                  >
                    {t("admin.homePageSectionFormDialog.addRowCard")}
                  </Button>
                </div>
              </div>
            ) : null}

            {type === "quote_calculator" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="quote-eyebrow"
                  label={t("admin.homePageSectionFormDialog.eyebrow")}
                  value={quoteCalculator.eyebrow}
                  onChange={(eyebrow) =>
                    setQuoteCalculator({ ...quoteCalculator, eyebrow })
                  }
                />
                <TextField
                  id="quote-heading"
                  label={t("admin.homePageSectionFormDialog.heading")}
                  value={quoteCalculator.heading}
                  onChange={(heading) =>
                    setQuoteCalculator({ ...quoteCalculator, heading })
                  }
                />
                <TextAreaField
                  id="quote-intro"
                  label={t("admin.homePageSectionFormDialog.intro")}
                  value={quoteCalculator.intro}
                  onChange={(intro) =>
                    setQuoteCalculator({ ...quoteCalculator, intro })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t(
                    "admin.homePageSectionFormDialog.theCalculatorItselfIsTheLive",
                  )}
                </p>
              </div>
            ) : null}

            {type === "category_tiles" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="tiles-eyebrow"
                  label={t("admin.homePageSectionFormDialog.eyebrow")}
                  value={categoryTiles.eyebrow}
                  onChange={(eyebrow) =>
                    setCategoryTiles({ ...categoryTiles, eyebrow })
                  }
                />
                <TextField
                  id="tiles-heading"
                  label={t("admin.homePageSectionFormDialog.heading")}
                  value={categoryTiles.heading}
                  onChange={(heading) =>
                    setCategoryTiles({ ...categoryTiles, heading })
                  }
                />
                <TextAreaField
                  id="tiles-intro"
                  label={t("admin.homePageSectionFormDialog.intro")}
                  rows={3}
                  hint={t(
                    "admin.homePageSectionFormDialog.theTilesThemselvesAreGeneratedFrom",
                  )}
                  value={categoryTiles.intro}
                  onChange={(intro) =>
                    setCategoryTiles({ ...categoryTiles, intro })
                  }
                />
              </div>
            ) : null}

            {type === "vehicle_types" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="fleet-eyebrow"
                  label={t("admin.homePageSectionFormDialog.eyebrow")}
                  value={vehicleTypes.eyebrow}
                  onChange={(eyebrow) =>
                    setVehicleTypes({ ...vehicleTypes, eyebrow })
                  }
                />
                <TextField
                  id="fleet-heading"
                  label={t("admin.homePageSectionFormDialog.heading")}
                  value={vehicleTypes.heading}
                  onChange={(heading) =>
                    setVehicleTypes({ ...vehicleTypes, heading })
                  }
                />
                <TextAreaField
                  id="fleet-intro"
                  label={t("admin.homePageSectionFormDialog.intro")}
                  hint={t("admin.homePageSectionFormDialog.optional")}
                  value={vehicleTypes.intro ?? ""}
                  onChange={(intro) =>
                    setVehicleTypes({ ...vehicleTypes, intro })
                  }
                />
                <TextField
                  id="fleet-medium-duty-label"
                  label={t(
                    "admin.homePageSectionFormDialog.mediumDutyGroupHeading",
                  )}
                  hint={t(
                    "admin.homePageSectionFormDialog.optionalMediumDutyHeading",
                  )}
                  value={vehicleTypes.mediumDutyLabel ?? ""}
                  onChange={(mediumDutyLabel) =>
                    setVehicleTypes({ ...vehicleTypes, mediumDutyLabel })
                  }
                />
                <TextField
                  id="fleet-heavy-duty-label"
                  label={t(
                    "admin.homePageSectionFormDialog.heavyDutyGroupHeading",
                  )}
                  hint={t(
                    "admin.homePageSectionFormDialog.optionalTheHeadingAboveTheHeavy",
                  )}
                  value={vehicleTypes.heavyDutyLabel ?? ""}
                  onChange={(heavyDutyLabel) =>
                    setVehicleTypes({ ...vehicleTypes, heavyDutyLabel })
                  }
                />

                <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                  <span className="text-sm font-medium">
                    {t("admin.homePageSectionFormDialog.businessPanel")}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "admin.homePageSectionFormDialog.thePanelThatClosesTheSection",
                    )}
                  </p>
                  <TextField
                    id="fleet-panel-title"
                    label={t("common.shared.title")}
                    value={vehicleTypes.businessPanel?.title ?? ""}
                    onChange={(title) =>
                      setVehicleTypes({
                        ...vehicleTypes,
                        businessPanel: withBusinessPanel({ title }),
                      })
                    }
                  />
                  <TextAreaField
                    id="fleet-panel-body"
                    label={t("common.shared.body")}
                    value={vehicleTypes.businessPanel?.body ?? ""}
                    onChange={(body) =>
                      setVehicleTypes({
                        ...vehicleTypes,
                        businessPanel: withBusinessPanel({ body }),
                      })
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField
                      id="fleet-panel-cta-label"
                      label={t("admin.homePageSectionFormDialog.buttonLabel")}
                      value={vehicleTypes.businessPanel?.ctaLabel ?? ""}
                      onChange={(ctaLabel) =>
                        setVehicleTypes({
                          ...vehicleTypes,
                          businessPanel: withBusinessPanel({ ctaLabel }),
                        })
                      }
                    />
                    <TextField
                      id="fleet-panel-cta-href"
                      label={t("admin.homePageSectionFormDialog.buttonLink")}
                      value={vehicleTypes.businessPanel?.ctaHref ?? ""}
                      onChange={(ctaHref) =>
                        setVehicleTypes({
                          ...vehicleTypes,
                          businessPanel: withBusinessPanel({ ctaHref }),
                        })
                      }
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t(
                    "admin.homePageSectionFormDialog.theDutyClassesAndTheirVehicles",
                  )}
                </p>
              </div>
            ) : null}

            {type === "how_it_works" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="steps-eyebrow"
                  label={t("admin.homePageSectionFormDialog.eyebrow")}
                  value={howItWorks.eyebrow}
                  onChange={(eyebrow) =>
                    setHowItWorks({ ...howItWorks, eyebrow })
                  }
                />
                <TextField
                  id="steps-heading"
                  label={t("admin.homePageSectionFormDialog.heading")}
                  value={howItWorks.heading}
                  onChange={(heading) =>
                    setHowItWorks({ ...howItWorks, heading })
                  }
                />
                <TextAreaField
                  id="steps-aside"
                  label={t("admin.homePageSectionFormDialog.aside")}
                  // Optional since the redesign dropped the aside column, and
                  // the field takes a string.
                  hint={t(
                    "admin.homePageSectionFormDialog.optionalTheRedesignSLayoutHas",
                  )}
                  value={howItWorks.aside ?? ""}
                  onChange={(aside) => setHowItWorks({ ...howItWorks, aside })}
                />

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {t("admin.homePageSectionFormDialog.steps")}
                  </span>
                  {howItWorks.steps.map((step, index) => (
                    <RepeatableEntry
                      // Position: two steps may share a title, and the list is
                      // only ever edited through these controls.
                      key={index}
                      title={t("admin.homePageSectionFormDialog.stepTitle", {
                        number: index + 1,
                      })}
                      onMoveUp={
                        index === 0
                          ? undefined
                          : () =>
                              setHowItWorks({
                                ...howItWorks,
                                steps: moveAt(howItWorks.steps, index, -1),
                              })
                      }
                      onMoveDown={
                        index === howItWorks.steps.length - 1
                          ? undefined
                          : () =>
                              setHowItWorks({
                                ...howItWorks,
                                steps: moveAt(howItWorks.steps, index, 1),
                              })
                      }
                      onRemove={() =>
                        setHowItWorks({
                          ...howItWorks,
                          steps: removeAt(howItWorks.steps, index),
                        })
                      }
                    >
                      <TextField
                        id={`step-title-${index}`}
                        label={t("common.shared.title")}
                        value={step.title}
                        onChange={(title) =>
                          setHowItWorks({
                            ...howItWorks,
                            steps: replaceAt(howItWorks.steps, index, {
                              ...step,
                              title,
                            }),
                          })
                        }
                      />
                      <TextAreaField
                        id={`step-body-${index}`}
                        label={t("common.shared.body")}
                        value={step.body}
                        onChange={(body) =>
                          setHowItWorks({
                            ...howItWorks,
                            steps: replaceAt(howItWorks.steps, index, {
                              ...step,
                              body,
                            }),
                          })
                        }
                      />
                    </RepeatableEntry>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      setHowItWorks({
                        ...howItWorks,
                        steps: [...howItWorks.steps, { title: "", body: "" }],
                      })
                    }
                  >
                    {t("admin.homePageSectionFormDialog.addStep")}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "admin.homePageSectionFormDialog.stepsAreNumberedByTheirPosition",
                    )}
                  </p>
                </div>
              </div>
            ) : null}

            {type === "driver_cta" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="driver-eyebrow"
                  label={t("admin.homePageSectionFormDialog.eyebrow")}
                  value={driverCta.eyebrow}
                  onChange={(eyebrow) =>
                    setDriverCta({ ...driverCta, eyebrow })
                  }
                />
                <TextAreaField
                  id="driver-headline"
                  label={t("admin.homePageSectionFormDialog.headline")}
                  rows={2}
                  hint={t(
                    "admin.homePageSectionFormDialog.eachNewLineIsRenderedAs",
                  )}
                  value={driverCta.headline}
                  onChange={(headline) =>
                    setDriverCta({ ...driverCta, headline })
                  }
                />
                <TextAreaField
                  id="driver-subtext"
                  label={t("admin.homePageSectionFormDialog.subtext")}
                  value={driverCta.subtext}
                  onChange={(subtext) =>
                    setDriverCta({ ...driverCta, subtext })
                  }
                />
                <TextField
                  id="driver-cta-label"
                  label={t("admin.homePageSectionFormDialog.buttonLabel")}
                  value={driverCta.ctaLabel}
                  onChange={(ctaLabel) =>
                    setDriverCta({ ...driverCta, ctaLabel })
                  }
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id="driver-secondary-cta-label"
                    label={t(
                      "admin.homePageSectionFormDialog.secondaryLinkLabel",
                    )}
                    value={driverCta.secondaryCtaLabel ?? ""}
                    onChange={(secondaryCtaLabel) =>
                      setDriverCta({ ...driverCta, secondaryCtaLabel })
                    }
                  />
                  <TextField
                    id="driver-secondary-cta-href"
                    label={t(
                      "admin.homePageSectionFormDialog.secondaryLinkUrl",
                    )}
                    hint={t(
                      "admin.homePageSectionFormDialog.optionalPairBothHalves",
                    )}
                    value={driverCta.secondaryCtaHref ?? ""}
                    onChange={(secondaryCtaHref) =>
                      setDriverCta({ ...driverCta, secondaryCtaHref })
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="driver-image-url">
                    {t("admin.homePageSectionFormDialog.driverPhotograph")}
                  </Label>
                  <AdminImageUpload
                    id="driver-image-url"
                    purpose={DRIVER_IMAGE_PURPOSE}
                    // Optional: an empty value is dropped by the shared parser
                    // rather than stored as "", so removing the image saves the
                    // section without the field.
                    value={driverCta.imageUrl ?? ""}
                    onChange={(imageUrl) =>
                      setDriverCta({ ...driverCta, imageUrl })
                    }
                    disabled={pending}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "admin.homePageSectionFormDialog.fillsThePanelSRightColumn",
                    )}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {t("admin.homePageSectionFormDialog.points")}
                  </span>
                  {driverCta.points.map((point, index) => (
                    <RepeatableEntry
                      key={index}
                      title={t("admin.homePageSectionFormDialog.pointTitle", {
                        number: index + 1,
                      })}
                      onMoveUp={
                        index === 0
                          ? undefined
                          : () =>
                              setDriverCta({
                                ...driverCta,
                                points: moveAt(driverCta.points, index, -1),
                              })
                      }
                      onMoveDown={
                        index === driverCta.points.length - 1
                          ? undefined
                          : () =>
                              setDriverCta({
                                ...driverCta,
                                points: moveAt(driverCta.points, index, 1),
                              })
                      }
                      onRemove={() =>
                        setDriverCta({
                          ...driverCta,
                          points: removeAt(driverCta.points, index),
                        })
                      }
                    >
                      <TextAreaField
                        id={`driver-point-${index}`}
                        label={t("admin.homePageSectionFormDialog.text")}
                        rows={2}
                        value={point}
                        onChange={(next) =>
                          setDriverCta({
                            ...driverCta,
                            points: replaceAt(driverCta.points, index, next),
                          })
                        }
                      />
                    </RepeatableEntry>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      setDriverCta({
                        ...driverCta,
                        points: [...driverCta.points, ""],
                      })
                    }
                  >
                    {t("admin.homePageSectionFormDialog.addPoint")}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "admin.homePageSectionFormDialog.whereTheButtonSendsADriver",
                    )}
                  </p>
                </div>
              </div>
            ) : null}

            {type === "coverage" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="coverage-eyebrow"
                  label={t("admin.homePageSectionFormDialog.eyebrow")}
                  value={coverage.eyebrow}
                  onChange={(eyebrow) => setCoverage({ ...coverage, eyebrow })}
                />
                <TextField
                  id="coverage-heading"
                  label={t("admin.homePageSectionFormDialog.heading")}
                  value={coverage.heading}
                  onChange={(heading) => setCoverage({ ...coverage, heading })}
                />
                <TextAreaField
                  id="coverage-body"
                  label={t("common.shared.body")}
                  rows={4}
                  value={coverage.body}
                  onChange={(body) => setCoverage({ ...coverage, body })}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id="coverage-cta-label"
                    label={t("admin.homePageSectionFormDialog.buttonLabel")}
                    value={coverage.ctaLabel}
                    onChange={(ctaLabel) =>
                      setCoverage({ ...coverage, ctaLabel })
                    }
                  />
                  <TextField
                    id="coverage-cta-href"
                    label={t("admin.homePageSectionFormDialog.buttonLink")}
                    value={coverage.ctaHref}
                    onChange={(ctaHref) =>
                      setCoverage({ ...coverage, ctaHref })
                    }
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {t("admin.homePageSectionFormDialog.cities")}
                  </span>
                  {coverage.cities.map((city, index) => (
                    <RepeatableEntry
                      key={index}
                      title={t("admin.homePageSectionFormDialog.cityTitle", {
                        number: index + 1,
                      })}
                      onMoveUp={
                        index === 0
                          ? undefined
                          : () =>
                              setCoverage({
                                ...coverage,
                                cities: moveAt(coverage.cities, index, -1),
                              })
                      }
                      onMoveDown={
                        index === coverage.cities.length - 1
                          ? undefined
                          : () =>
                              setCoverage({
                                ...coverage,
                                cities: moveAt(coverage.cities, index, 1),
                              })
                      }
                      onRemove={() =>
                        setCoverage({
                          ...coverage,
                          cities: removeAt(coverage.cities, index),
                        })
                      }
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TextField
                          id={`coverage-city-${index}-name`}
                          label={t("common.shared.name")}
                          value={city.name}
                          onChange={(name) =>
                            setCoverage({
                              ...coverage,
                              cities: replaceAt(coverage.cities, index, {
                                ...city,
                                name,
                              }),
                            })
                          }
                        />
                        <TextField
                          id={`coverage-city-${index}-tier`}
                          label={t("admin.homePageSectionFormDialog.tier")}
                          value={city.tier}
                          onChange={(tier) =>
                            setCoverage({
                              ...coverage,
                              cities: replaceAt(coverage.cities, index, {
                                ...city,
                                tier,
                              }),
                            })
                          }
                        />
                      </div>
                    </RepeatableEntry>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      setCoverage({
                        ...coverage,
                        cities: [...coverage.cities, { name: "", tier: "" }],
                      })
                    }
                  >
                    {t("admin.homePageSectionFormDialog.addCity")}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "admin.homePageSectionFormDialog.bothFieldsAreFreeTextAnd",
                    )}
                  </p>
                </div>
              </div>
            ) : null}

            {type === "faq" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="faq-eyebrow"
                  label={t("admin.homePageSectionFormDialog.eyebrow")}
                  value={faq.eyebrow}
                  onChange={(eyebrow) => setFaq({ ...faq, eyebrow })}
                />
                <TextField
                  id="faq-heading"
                  label={t("admin.homePageSectionFormDialog.heading")}
                  value={faq.heading}
                  onChange={(heading) => setFaq({ ...faq, heading })}
                />
                <TextAreaField
                  id="faq-intro"
                  label={t("admin.homePageSectionFormDialog.intro")}
                  value={faq.intro}
                  onChange={(intro) => setFaq({ ...faq, intro })}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id="faq-support-link-label"
                    label={t(
                      "admin.homePageSectionFormDialog.supportLinkLabel",
                    )}
                    value={faq.supportLinkLabel ?? ""}
                    onChange={(supportLinkLabel) =>
                      setFaq({ ...faq, supportLinkLabel })
                    }
                  />
                  <TextField
                    id="faq-support-link-href"
                    label={t("admin.homePageSectionFormDialog.supportLinkUrl")}
                    hint={t(
                      "admin.homePageSectionFormDialog.optionalLinkBothHalves",
                    )}
                    value={faq.supportLinkHref ?? ""}
                    onChange={(supportLinkHref) =>
                      setFaq({ ...faq, supportLinkHref })
                    }
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {t("common.shared.questions")}
                  </span>
                  {faq.items.map((item, index) => (
                    <RepeatableEntry
                      key={index}
                      title={t(
                        "admin.homePageSectionFormDialog.questionTitle",
                        { number: index + 1 },
                      )}
                      onMoveUp={
                        index === 0
                          ? undefined
                          : () =>
                              setFaq({
                                ...faq,
                                items: moveAt(faq.items, index, -1),
                              })
                      }
                      onMoveDown={
                        index === faq.items.length - 1
                          ? undefined
                          : () =>
                              setFaq({
                                ...faq,
                                items: moveAt(faq.items, index, 1),
                              })
                      }
                      onRemove={() =>
                        setFaq({ ...faq, items: removeAt(faq.items, index) })
                      }
                    >
                      <TextField
                        id={`faq-question-${index}`}
                        label={t("admin.homePageSectionFormDialog.question")}
                        value={item.question}
                        onChange={(question) =>
                          setFaq({
                            ...faq,
                            items: replaceAt(faq.items, index, {
                              ...item,
                              question,
                            }),
                          })
                        }
                      />
                      <TextAreaField
                        id={`faq-answer-${index}`}
                        label={t("admin.homePageSectionFormDialog.answer")}
                        rows={4}
                        value={item.answer}
                        onChange={(answer) =>
                          setFaq({
                            ...faq,
                            items: replaceAt(faq.items, index, {
                              ...item,
                              answer,
                            }),
                          })
                        }
                      />
                    </RepeatableEntry>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      setFaq({
                        ...faq,
                        items: [...faq.items, { question: "", answer: "" }],
                      })
                    }
                  >
                    {t("admin.homePageSectionFormDialog.addQuestion")}
                  </Button>
                </div>
              </div>
            ) : null}

            {type === "closing_cta" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="closing-heading"
                  label={t("admin.homePageSectionFormDialog.heading")}
                  value={closingCta.heading}
                  onChange={(heading) =>
                    setClosingCta({ ...closingCta, heading })
                  }
                />
                <TextAreaField
                  id="closing-body"
                  label={t("common.shared.body")}
                  value={closingCta.body}
                  onChange={(body) => setClosingCta({ ...closingCta, body })}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id="closing-primary-cta-label"
                    label={t(
                      "admin.homePageSectionFormDialog.primaryButtonLabel",
                    )}
                    value={closingCta.primaryCtaLabel}
                    onChange={(primaryCtaLabel) =>
                      setClosingCta({ ...closingCta, primaryCtaLabel })
                    }
                  />
                  <TextField
                    id="closing-primary-cta-href"
                    label={t(
                      "admin.homePageSectionFormDialog.primaryButtonLink",
                    )}
                    value={closingCta.primaryCtaHref}
                    onChange={(primaryCtaHref) =>
                      setClosingCta({ ...closingCta, primaryCtaHref })
                    }
                  />
                  <TextField
                    id="closing-secondary-cta-label"
                    label={t(
                      "admin.homePageSectionFormDialog.secondaryButtonLabel",
                    )}
                    value={closingCta.secondaryCtaLabel}
                    onChange={(secondaryCtaLabel) =>
                      setClosingCta({ ...closingCta, secondaryCtaLabel })
                    }
                  />
                  <TextField
                    id="closing-secondary-cta-href"
                    label={t(
                      "admin.homePageSectionFormDialog.secondaryButtonLink",
                    )}
                    value={closingCta.secondaryCtaHref}
                    onChange={(secondaryCtaHref) =>
                      setClosingCta({ ...closingCta, secondaryCtaHref })
                    }
                  />
                </div>
              </div>
            ) : null}

            {type === "nav" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="nav-wordmark"
                  label={t("admin.homePageSectionFormDialog.wordmark")}
                  value={nav.wordmark}
                  onChange={(wordmark) => setNav({ ...nav, wordmark })}
                />

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {t("admin.homePageSectionFormDialog.links")}
                  </span>
                  {nav.links.map((link, index) => (
                    <RepeatableEntry
                      key={index}
                      title={t("admin.homePageSectionFormDialog.linkTitle", {
                        number: index + 1,
                      })}
                      onMoveUp={
                        index === 0
                          ? undefined
                          : () =>
                              setNav({
                                ...nav,
                                links: moveAt(nav.links, index, -1),
                              })
                      }
                      onMoveDown={
                        index === nav.links.length - 1
                          ? undefined
                          : () =>
                              setNav({
                                ...nav,
                                links: moveAt(nav.links, index, 1),
                              })
                      }
                      onRemove={() =>
                        setNav({ ...nav, links: removeAt(nav.links, index) })
                      }
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TextField
                          id={`nav-link-${index}-label`}
                          label={t("admin.homePageSectionFormDialog.label")}
                          value={link.label}
                          onChange={(label) =>
                            setNav({
                              ...nav,
                              links: replaceAt(nav.links, index, {
                                ...link,
                                label,
                              }),
                            })
                          }
                        />
                        <TextField
                          id={`nav-link-${index}-href`}
                          label={t("admin.homePageSectionFormDialog.url")}
                          value={link.href}
                          onChange={(href) =>
                            setNav({
                              ...nav,
                              links: replaceAt(nav.links, index, {
                                ...link,
                                href,
                              }),
                            })
                          }
                        />
                      </div>
                    </RepeatableEntry>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      setNav({
                        ...nav,
                        links: [...nav.links, { label: "", href: "" }],
                      })
                    }
                  >
                    {t("admin.homePageSectionFormDialog.addLink")}
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id="nav-sign-in-label"
                    label={t("admin.homePageSectionFormDialog.signInLabel")}
                    value={nav.signInLabel}
                    onChange={(signInLabel) => setNav({ ...nav, signInLabel })}
                  />
                  <TextField
                    id="nav-sign-in-href"
                    label={t("admin.homePageSectionFormDialog.signInLink")}
                    value={nav.signInHref}
                    onChange={(signInHref) => setNav({ ...nav, signInHref })}
                  />
                  <TextField
                    id="nav-sign-up-label"
                    label={t("admin.homePageSectionFormDialog.signUpLabel")}
                    value={nav.signUpLabel}
                    onChange={(signUpLabel) => setNav({ ...nav, signUpLabel })}
                  />
                  <TextField
                    id="nav-sign-up-href"
                    label={t("admin.homePageSectionFormDialog.signUpLink")}
                    value={nav.signUpHref}
                    onChange={(signUpHref) => setNav({ ...nav, signUpHref })}
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  {t(
                    "admin.homePageSectionFormDialog.theNavigationBarIsPageChrome",
                  )}
                </p>
              </div>
            ) : null}

            {type === "footer" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="footer-brand-name"
                  label={t("admin.homePageSectionFormDialog.brandName")}
                  value={footer.brandName}
                  onChange={(brandName) => setFooter({ ...footer, brandName })}
                />
                <TextAreaField
                  id="footer-brand-blurb"
                  label={t("admin.homePageSectionFormDialog.brandBlurb")}
                  value={footer.brandBlurb}
                  onChange={(brandBlurb) =>
                    setFooter({ ...footer, brandBlurb })
                  }
                />
                <TextField
                  id="footer-copyright"
                  label={t("admin.homePageSectionFormDialog.copyrightLine")}
                  hint={t("admin.homePageSectionFormDialog.copyrightYearHint")}
                  value={footer.copyright}
                  onChange={(copyright) => setFooter({ ...footer, copyright })}
                />

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {t("admin.homePageSectionFormDialog.columns")}
                  </span>
                  {footer.columns.map((column, columnIndex) => (
                    <RepeatableEntry
                      key={columnIndex}
                      title={t(
                        "admin.homePageSectionFormDialog.columnTitleNumber",
                        { number: columnIndex + 1 },
                      )}
                      onMoveUp={
                        columnIndex === 0
                          ? undefined
                          : () =>
                              setFooter({
                                ...footer,
                                columns: moveAt(
                                  footer.columns,
                                  columnIndex,
                                  -1,
                                ),
                              })
                      }
                      onMoveDown={
                        columnIndex === footer.columns.length - 1
                          ? undefined
                          : () =>
                              setFooter({
                                ...footer,
                                columns: moveAt(footer.columns, columnIndex, 1),
                              })
                      }
                      onRemove={() =>
                        setFooter({
                          ...footer,
                          columns: removeAt(footer.columns, columnIndex),
                        })
                      }
                    >
                      <TextField
                        id={`footer-col-${columnIndex}-title`}
                        label={t("admin.homePageSectionFormDialog.columnTitle")}
                        value={column.title}
                        onChange={(title) =>
                          setFooter({
                            ...footer,
                            columns: replaceAt(footer.columns, columnIndex, {
                              ...column,
                              title,
                            }),
                          })
                        }
                      />

                      {/* The one nested list in the contract: a column's own
                          links, keyed by both indices so no two fields in the
                          dialog can share an id. */}
                      <div className="flex flex-col gap-2 pl-3">
                        <span className="text-xs font-medium">
                          {t("admin.homePageSectionFormDialog.links")}
                        </span>
                        {column.links.map((link, linkIndex) => (
                          <RepeatableEntry
                            key={linkIndex}
                            title={t(
                              "admin.homePageSectionFormDialog.columnLinkTitle",
                              { column: columnIndex + 1, link: linkIndex + 1 },
                            )}
                            onMoveUp={
                              linkIndex === 0
                                ? undefined
                                : () =>
                                    setFooter({
                                      ...footer,
                                      columns: replaceAt(
                                        footer.columns,
                                        columnIndex,
                                        {
                                          ...column,
                                          links: moveAt(
                                            column.links,
                                            linkIndex,
                                            -1,
                                          ),
                                        },
                                      ),
                                    })
                            }
                            onMoveDown={
                              linkIndex === column.links.length - 1
                                ? undefined
                                : () =>
                                    setFooter({
                                      ...footer,
                                      columns: replaceAt(
                                        footer.columns,
                                        columnIndex,
                                        {
                                          ...column,
                                          links: moveAt(
                                            column.links,
                                            linkIndex,
                                            1,
                                          ),
                                        },
                                      ),
                                    })
                            }
                            onRemove={() =>
                              setFooter({
                                ...footer,
                                columns: replaceAt(
                                  footer.columns,
                                  columnIndex,
                                  {
                                    ...column,
                                    links: removeAt(column.links, linkIndex),
                                  },
                                ),
                              })
                            }
                          >
                            <div className="grid gap-3 sm:grid-cols-2">
                              <TextField
                                id={`footer-col-${columnIndex}-link-${linkIndex}-label`}
                                label={t(
                                  "admin.homePageSectionFormDialog.label",
                                )}
                                value={link.label}
                                onChange={(label) =>
                                  setFooter({
                                    ...footer,
                                    columns: replaceAt(
                                      footer.columns,
                                      columnIndex,
                                      {
                                        ...column,
                                        links: replaceAt(
                                          column.links,
                                          linkIndex,
                                          { ...link, label },
                                        ),
                                      },
                                    ),
                                  })
                                }
                              />
                              <TextField
                                id={`footer-col-${columnIndex}-link-${linkIndex}-href`}
                                label={t("admin.homePageSectionFormDialog.url")}
                                value={link.href}
                                onChange={(href) =>
                                  setFooter({
                                    ...footer,
                                    columns: replaceAt(
                                      footer.columns,
                                      columnIndex,
                                      {
                                        ...column,
                                        links: replaceAt(
                                          column.links,
                                          linkIndex,
                                          { ...link, href },
                                        ),
                                      },
                                    ),
                                  })
                                }
                              />
                            </div>
                          </RepeatableEntry>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="self-start"
                          onClick={() =>
                            setFooter({
                              ...footer,
                              columns: replaceAt(footer.columns, columnIndex, {
                                ...column,
                                links: [
                                  ...column.links,
                                  { label: "", href: "" },
                                ],
                              }),
                            })
                          }
                        >
                          {t("admin.homePageSectionFormDialog.addLink")}
                        </Button>
                      </div>
                    </RepeatableEntry>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      setFooter({
                        ...footer,
                        columns: [...footer.columns, { title: "", links: [] }],
                      })
                    }
                  >
                    {t("admin.homePageSectionFormDialog.addColumn")}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "admin.homePageSectionFormDialog.columnsReadLeftToRightIn",
                    )}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {t("admin.homePageSectionFormDialog.legalLinks")}
                  </span>
                  {footer.legalLinks.map((link, index) => (
                    <RepeatableEntry
                      key={index}
                      title={t(
                        "admin.homePageSectionFormDialog.legalLinkTitle",
                        { number: index + 1 },
                      )}
                      onMoveUp={
                        index === 0
                          ? undefined
                          : () =>
                              setFooter({
                                ...footer,
                                legalLinks: moveAt(
                                  footer.legalLinks,
                                  index,
                                  -1,
                                ),
                              })
                      }
                      onMoveDown={
                        index === footer.legalLinks.length - 1
                          ? undefined
                          : () =>
                              setFooter({
                                ...footer,
                                legalLinks: moveAt(footer.legalLinks, index, 1),
                              })
                      }
                      onRemove={() =>
                        setFooter({
                          ...footer,
                          legalLinks: removeAt(footer.legalLinks, index),
                        })
                      }
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TextField
                          id={`footer-legal-${index}-label`}
                          label={t("admin.homePageSectionFormDialog.label")}
                          value={link.label}
                          onChange={(label) =>
                            setFooter({
                              ...footer,
                              legalLinks: replaceAt(footer.legalLinks, index, {
                                ...link,
                                label,
                              }),
                            })
                          }
                        />
                        <TextField
                          id={`footer-legal-${index}-href`}
                          label={t("admin.homePageSectionFormDialog.url")}
                          value={link.href}
                          onChange={(href) =>
                            setFooter({
                              ...footer,
                              legalLinks: replaceAt(footer.legalLinks, index, {
                                ...link,
                                href,
                              }),
                            })
                          }
                        />
                      </div>
                    </RepeatableEntry>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      setFooter({
                        ...footer,
                        legalLinks: [
                          ...footer.legalLinks,
                          { label: "", href: "" },
                        ],
                      })
                    }
                  >
                    {t("admin.homePageSectionFormDialog.addLegalLink")}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t("admin.homePageSectionFormDialog.theFooterIsPageChromeIt")}
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="section-sort-order">
                  {t("common.shared.sortOrder")}
                </Label>
                <Input
                  id="section-sort-order"
                  type="number"
                  inputMode="numeric"
                  min={MIN_SORT_ORDER}
                  max={MAX_SORT_ORDER}
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value)}
                />
              </div>

              <div className="flex items-end">
                <Label className="flex items-center gap-2">
                  <Checkbox
                    checked={isActive}
                    onCheckedChange={(checked) => setIsActive(checked === true)}
                  />
                  {t("common.shared.active")}
                </Label>
              </div>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter showCloseButton={false}>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              {t("common.shared.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? t("common.shared.saving")
                : isEditing
                  ? t("admin.homePageSectionFormDialog.saveSection")
                  : t("admin.homePageSectionFormDialog.createSection")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
