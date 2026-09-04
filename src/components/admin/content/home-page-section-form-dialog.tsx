"use client";

import { useState } from "react";

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
  HOME_PAGE_SECTION_TYPE_LABELS,
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
                aria-label={`Move ${title} up`}
                onClick={onMoveUp}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={onMoveDown === undefined}
                aria-label={`Move ${title} down`}
                onClick={onMoveDown}
              >
                ↓
              </Button>
            </>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
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
          error: `Tracking panel progress must be a whole number between ${MIN_PROGRESS_PERCENT} and ${MAX_PROGRESS_PERCENT}.`,
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
        `Sort order must be a whole number between ${MIN_SORT_ORDER} and ${MAX_SORT_ORDER}.`,
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
              ? "Could not save this section."
              : "Could not create this section.",
          ),
        );
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
              {isEditing ? "Edit section" : "New section"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Changes go live on the public landing page as soon as you save."
                : "Adds a section to the landing page for this locale. It goes live as soon as it is saved and active."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="section-type">Section type</Label>
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
                      {HOME_PAGE_SECTION_TYPE_LABELS[sectionType]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The type decides which landing component renders this section,
                and therefore which fields it carries.
              </p>
            </div>

            {type === "hero" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="hero-eyebrow"
                  label="Eyebrow"
                  value={hero.eyebrow}
                  onChange={(eyebrow) => setHero({ ...hero, eyebrow })}
                />
                <TextField
                  id="hero-headline"
                  label="Headline"
                  value={hero.headline}
                  onChange={(headline) => setHero({ ...hero, headline })}
                />
                <TextAreaField
                  id="hero-subtext"
                  label="Subtext"
                  rows={4}
                  value={hero.subtext}
                  onChange={(subtext) => setHero({ ...hero, subtext })}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id="hero-status-chip-text"
                    label="Status chip text"
                    value={hero.statusChipText ?? ""}
                    onChange={(statusChipText) =>
                      setHero({ ...hero, statusChipText })
                    }
                  />
                  <TextField
                    id="hero-status-chip-tag"
                    label="Status chip tag"
                    hint="Both chip fields are optional; leave them empty for no chip."
                    value={hero.statusChipTag ?? ""}
                    onChange={(statusChipTag) =>
                      setHero({ ...hero, statusChipTag })
                    }
                  />
                  <TextField
                    id="hero-primary-cta-label"
                    label="Primary button label"
                    value={hero.primaryCtaLabel}
                    onChange={(primaryCtaLabel) =>
                      setHero({ ...hero, primaryCtaLabel })
                    }
                  />
                  <TextField
                    id="hero-primary-cta-href"
                    label="Primary button link"
                    value={hero.primaryCtaHref}
                    onChange={(primaryCtaHref) =>
                      setHero({ ...hero, primaryCtaHref })
                    }
                  />
                  <TextField
                    id="hero-secondary-cta-label"
                    label="Secondary button label"
                    value={hero.secondaryCtaLabel}
                    onChange={(secondaryCtaLabel) =>
                      setHero({ ...hero, secondaryCtaLabel })
                    }
                  />
                  <TextField
                    id="hero-secondary-cta-href"
                    label="Secondary button link"
                    value={hero.secondaryCtaHref}
                    onChange={(secondaryCtaHref) =>
                      setHero({ ...hero, secondaryCtaHref })
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  The figures below the hero are the stats row, which is a
                  section of its own. The retired headline highlight has no
                  field here, so saving a hero authored before the redesign
                  drops it.
                </p>
              </div>
            ) : null}

            {type === "hero_carousel" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="carousel-fallback-caption"
                  label="Fallback caption"
                  hint="Optional. Used for a slide whose banner has no usable title."
                  value={heroCarousel.fallbackCaption ?? ""}
                  onChange={(fallbackCaption) =>
                    setHeroCarousel({ ...heroCarousel, fallbackCaption })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  The slides themselves are Banners at the{" "}
                  <span className="font-mono">
                    {HOME_HERO_BANNER_PLACEMENT}
                  </span>{" "}
                  placement, edited under Content → Banners, and each slide’s
                  caption is that banner’s title. The carousel shows at most{" "}
                  {MAX_HERO_BANNERS} of them.
                </p>
              </div>
            ) : null}

            {type === "partner_marquee" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="marquee-eyebrow"
                  label="Eyebrow"
                  value={partnerMarquee.eyebrow}
                  onChange={(eyebrow) =>
                    setPartnerMarquee({ ...partnerMarquee, eyebrow })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  The logos are Banners at the{" "}
                  <span className="font-mono">
                    {HOME_PARTNER_LOGO_BANNER_PLACEMENT}
                  </span>{" "}
                  placement, edited under Content → Banners. This section only
                  carries the line above them.
                </p>
              </div>
            ) : null}

            {type === "stats" ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Tiles</span>
                  {stats.items.map((item, index) => (
                    <RepeatableEntry
                      // Position: two tiles may share a label, and the list is
                      // only ever edited through these controls.
                      key={index}
                      title={`Stat ${index + 1}`}
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
                          label="Value"
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
                          label="Label"
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
                    Add stat
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Tiles read left to right in this order. The design is four
                    of them; the grid tolerates fewer. A value is free text, so
                    “24/7” and “100%” are as valid as a number.
                  </p>
                </div>
              </div>
            ) : null}

            {type === "bento" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="bento-eyebrow"
                  label="Eyebrow"
                  value={bento.eyebrow}
                  onChange={(eyebrow) => setBento({ ...bento, eyebrow })}
                />
                <TextField
                  id="bento-heading"
                  label="Heading"
                  value={bento.heading}
                  onChange={(heading) => setBento({ ...bento, heading })}
                />
                <TextAreaField
                  id="bento-body"
                  label="Body"
                  rows={4}
                  value={bento.body}
                  onChange={(body) => setBento({ ...bento, body })}
                />

                <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                  <span className="text-sm font-medium">Tracking panel</span>
                  <p className="text-xs text-muted-foreground">
                    The mock order pinned to the large card. It is an
                    illustration, not live data — which is exactly why it is
                    authored here rather than hardcoded.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField
                      id="bento-order-label"
                      label="Order label"
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
                      label="ETA label"
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
                      label="From label"
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
                      label="To label"
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
                      Progress percent
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
                      How far along the progress bar sits: a whole number from{" "}
                      {MIN_PROGRESS_PERCENT} to {MAX_PROGRESS_PERCENT}.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Side cards</span>
                  <p className="text-xs text-muted-foreground">
                    Row A, the column beside the large card. The design is two
                    of them.
                  </p>
                  {bento.sideCards.map((card, index) => (
                    <RepeatableEntry
                      key={index}
                      title={`Side card ${index + 1}`}
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
                        label="Eyebrow"
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
                        label="Title"
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
                        label="Body"
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
                          label="Link label"
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
                          label="Link URL"
                          hint="Optional; most cards carry no link."
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
                    Add side card
                  </Button>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Row cards</span>
                  <p className="text-xs text-muted-foreground">
                    Row B, across the full width. The design is three of them.
                    They are a separate list from the side cards because the two
                    rows have different card sizes and grid tracks.
                  </p>
                  {bento.rowCards.map((card, index) => (
                    <RepeatableEntry
                      key={index}
                      title={`Row card ${index + 1}`}
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
                        label="Eyebrow"
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
                        label="Title"
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
                        label="Body"
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
                          label="Link label"
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
                          label="Link URL"
                          hint="Optional; most cards carry no link."
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
                    Add row card
                  </Button>
                </div>
              </div>
            ) : null}

            {type === "quote_calculator" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="quote-eyebrow"
                  label="Eyebrow"
                  value={quoteCalculator.eyebrow}
                  onChange={(eyebrow) =>
                    setQuoteCalculator({ ...quoteCalculator, eyebrow })
                  }
                />
                <TextField
                  id="quote-heading"
                  label="Heading"
                  value={quoteCalculator.heading}
                  onChange={(heading) =>
                    setQuoteCalculator({ ...quoteCalculator, heading })
                  }
                />
                <TextAreaField
                  id="quote-intro"
                  label="Intro"
                  value={quoteCalculator.intro}
                  onChange={(intro) =>
                    setQuoteCalculator({ ...quoteCalculator, intro })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  The calculator itself is the live pricing widget — it owns its
                  own labels and quotes against the real pricing endpoint, so
                  only the framing copy above is editable.
                </p>
              </div>
            ) : null}

            {type === "category_tiles" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="tiles-eyebrow"
                  label="Eyebrow"
                  value={categoryTiles.eyebrow}
                  onChange={(eyebrow) =>
                    setCategoryTiles({ ...categoryTiles, eyebrow })
                  }
                />
                <TextField
                  id="tiles-heading"
                  label="Heading"
                  value={categoryTiles.heading}
                  onChange={(heading) =>
                    setCategoryTiles({ ...categoryTiles, heading })
                  }
                />
                <TextAreaField
                  id="tiles-intro"
                  label="Intro"
                  rows={3}
                  hint="The tiles themselves are generated from the cargo taxonomy and its pricing rules."
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
                  label="Eyebrow"
                  value={vehicleTypes.eyebrow}
                  onChange={(eyebrow) =>
                    setVehicleTypes({ ...vehicleTypes, eyebrow })
                  }
                />
                <TextField
                  id="fleet-heading"
                  label="Heading"
                  value={vehicleTypes.heading}
                  onChange={(heading) =>
                    setVehicleTypes({ ...vehicleTypes, heading })
                  }
                />
                <TextAreaField
                  id="fleet-intro"
                  label="Intro"
                  hint="Optional."
                  value={vehicleTypes.intro ?? ""}
                  onChange={(intro) =>
                    setVehicleTypes({ ...vehicleTypes, intro })
                  }
                />
                <TextField
                  id="fleet-medium-duty-label"
                  label="Medium-duty group heading"
                  hint="Optional. The heading above the medium-duty vehicles. Renaming it is display only — it does not change the MEDIUM_DUTY category that drives matching and pricing."
                  value={vehicleTypes.mediumDutyLabel ?? ""}
                  onChange={(mediumDutyLabel) =>
                    setVehicleTypes({ ...vehicleTypes, mediumDutyLabel })
                  }
                />
                <TextField
                  id="fleet-heavy-duty-label"
                  label="Heavy-duty group heading"
                  hint="Optional. The heading above the heavy-duty vehicles. Display only, as above."
                  value={vehicleTypes.heavyDutyLabel ?? ""}
                  onChange={(heavyDutyLabel) =>
                    setVehicleTypes({ ...vehicleTypes, heavyDutyLabel })
                  }
                />

                <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                  <span className="text-sm font-medium">Business panel</span>
                  <p className="text-xs text-muted-foreground">
                    The panel that closes the section. Optional as a whole:
                    clear all four boxes to drop it. Fill any one of them and
                    all four are required.
                  </p>
                  <TextField
                    id="fleet-panel-title"
                    label="Title"
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
                    label="Body"
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
                      label="Button label"
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
                      label="Button link"
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
                  The duty classes and their vehicles come from the live
                  taxonomy, so only the framing copy is edited here.
                </p>
              </div>
            ) : null}

            {type === "how_it_works" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="steps-eyebrow"
                  label="Eyebrow"
                  value={howItWorks.eyebrow}
                  onChange={(eyebrow) =>
                    setHowItWorks({ ...howItWorks, eyebrow })
                  }
                />
                <TextField
                  id="steps-heading"
                  label="Heading"
                  value={howItWorks.heading}
                  onChange={(heading) =>
                    setHowItWorks({ ...howItWorks, heading })
                  }
                />
                <TextAreaField
                  id="steps-aside"
                  label="Aside"
                  // Optional since the redesign dropped the aside column, and
                  // the field takes a string.
                  hint="Optional. The redesign's layout has no column for it, but an existing paragraph is kept rather than discarded."
                  value={howItWorks.aside ?? ""}
                  onChange={(aside) => setHowItWorks({ ...howItWorks, aside })}
                />

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Steps</span>
                  {howItWorks.steps.map((step, index) => (
                    <RepeatableEntry
                      // Position: two steps may share a title, and the list is
                      // only ever edited through these controls.
                      key={index}
                      title={`Step ${index + 1}`}
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
                        label="Title"
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
                        label="Body"
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
                    Add step
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Steps are numbered by their position on the page.
                  </p>
                </div>
              </div>
            ) : null}

            {type === "driver_cta" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="driver-eyebrow"
                  label="Eyebrow"
                  value={driverCta.eyebrow}
                  onChange={(eyebrow) =>
                    setDriverCta({ ...driverCta, eyebrow })
                  }
                />
                <TextAreaField
                  id="driver-headline"
                  label="Headline"
                  rows={2}
                  hint="Each new line is rendered as a line break in the heading."
                  value={driverCta.headline}
                  onChange={(headline) =>
                    setDriverCta({ ...driverCta, headline })
                  }
                />
                <TextAreaField
                  id="driver-subtext"
                  label="Subtext"
                  value={driverCta.subtext}
                  onChange={(subtext) =>
                    setDriverCta({ ...driverCta, subtext })
                  }
                />
                <TextField
                  id="driver-cta-label"
                  label="Button label"
                  value={driverCta.ctaLabel}
                  onChange={(ctaLabel) =>
                    setDriverCta({ ...driverCta, ctaLabel })
                  }
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id="driver-secondary-cta-label"
                    label="Secondary link label"
                    value={driverCta.secondaryCtaLabel ?? ""}
                    onChange={(secondaryCtaLabel) =>
                      setDriverCta({ ...driverCta, secondaryCtaLabel })
                    }
                  />
                  <TextField
                    id="driver-secondary-cta-href"
                    label="Secondary link URL"
                    hint="Optional; the pair renders only when both halves are set."
                    value={driverCta.secondaryCtaHref ?? ""}
                    onChange={(secondaryCtaHref) =>
                      setDriverCta({ ...driverCta, secondaryCtaHref })
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="driver-image-url">Driver photograph</Label>
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
                    Fills the panel’s right column. Optional — the panel is
                    designed to render without one.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Points</span>
                  {driverCta.points.map((point, index) => (
                    <RepeatableEntry
                      key={index}
                      title={`Point ${index + 1}`}
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
                        label="Text"
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
                    Add point
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Where the button sends a driver depends on deployment
                    configuration, so it is not editable here.
                  </p>
                </div>
              </div>
            ) : null}

            {type === "coverage" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="coverage-eyebrow"
                  label="Eyebrow"
                  value={coverage.eyebrow}
                  onChange={(eyebrow) => setCoverage({ ...coverage, eyebrow })}
                />
                <TextField
                  id="coverage-heading"
                  label="Heading"
                  value={coverage.heading}
                  onChange={(heading) => setCoverage({ ...coverage, heading })}
                />
                <TextAreaField
                  id="coverage-body"
                  label="Body"
                  rows={4}
                  value={coverage.body}
                  onChange={(body) => setCoverage({ ...coverage, body })}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id="coverage-cta-label"
                    label="Button label"
                    value={coverage.ctaLabel}
                    onChange={(ctaLabel) =>
                      setCoverage({ ...coverage, ctaLabel })
                    }
                  />
                  <TextField
                    id="coverage-cta-href"
                    label="Button link"
                    value={coverage.ctaHref}
                    onChange={(ctaHref) =>
                      setCoverage({ ...coverage, ctaHref })
                    }
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Cities</span>
                  {coverage.cities.map((city, index) => (
                    <RepeatableEntry
                      key={index}
                      title={`City ${index + 1}`}
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
                          label="Name"
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
                          label="Tier"
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
                    Add city
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Both fields are free text and purely editorial. The name is
                    not tied to the city list the booking flow uses, and there
                    is no service-tier data anywhere in the system — a tier is
                    whatever a human who knows the real answer types here.
                  </p>
                </div>
              </div>
            ) : null}

            {type === "faq" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="faq-eyebrow"
                  label="Eyebrow"
                  value={faq.eyebrow}
                  onChange={(eyebrow) => setFaq({ ...faq, eyebrow })}
                />
                <TextField
                  id="faq-heading"
                  label="Heading"
                  value={faq.heading}
                  onChange={(heading) => setFaq({ ...faq, heading })}
                />
                <TextAreaField
                  id="faq-intro"
                  label="Intro"
                  value={faq.intro}
                  onChange={(intro) => setFaq({ ...faq, intro })}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id="faq-support-link-label"
                    label="Support link label"
                    value={faq.supportLinkLabel ?? ""}
                    onChange={(supportLinkLabel) =>
                      setFaq({ ...faq, supportLinkLabel })
                    }
                  />
                  <TextField
                    id="faq-support-link-href"
                    label="Support link URL"
                    hint="Optional; the link renders only when both halves are set, so a half-finished edit produces no link rather than a link to nowhere."
                    value={faq.supportLinkHref ?? ""}
                    onChange={(supportLinkHref) =>
                      setFaq({ ...faq, supportLinkHref })
                    }
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Questions</span>
                  {faq.items.map((item, index) => (
                    <RepeatableEntry
                      key={index}
                      title={`Question ${index + 1}`}
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
                        label="Question"
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
                        label="Answer"
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
                    Add question
                  </Button>
                </div>
              </div>
            ) : null}

            {type === "closing_cta" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="closing-heading"
                  label="Heading"
                  value={closingCta.heading}
                  onChange={(heading) =>
                    setClosingCta({ ...closingCta, heading })
                  }
                />
                <TextAreaField
                  id="closing-body"
                  label="Body"
                  value={closingCta.body}
                  onChange={(body) => setClosingCta({ ...closingCta, body })}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id="closing-primary-cta-label"
                    label="Primary button label"
                    value={closingCta.primaryCtaLabel}
                    onChange={(primaryCtaLabel) =>
                      setClosingCta({ ...closingCta, primaryCtaLabel })
                    }
                  />
                  <TextField
                    id="closing-primary-cta-href"
                    label="Primary button link"
                    value={closingCta.primaryCtaHref}
                    onChange={(primaryCtaHref) =>
                      setClosingCta({ ...closingCta, primaryCtaHref })
                    }
                  />
                  <TextField
                    id="closing-secondary-cta-label"
                    label="Secondary button label"
                    value={closingCta.secondaryCtaLabel}
                    onChange={(secondaryCtaLabel) =>
                      setClosingCta({ ...closingCta, secondaryCtaLabel })
                    }
                  />
                  <TextField
                    id="closing-secondary-cta-href"
                    label="Secondary button link"
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
                  label="Wordmark"
                  value={nav.wordmark}
                  onChange={(wordmark) => setNav({ ...nav, wordmark })}
                />

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Links</span>
                  {nav.links.map((link, index) => (
                    <RepeatableEntry
                      key={index}
                      title={`Link ${index + 1}`}
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
                          label="Label"
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
                          label="URL"
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
                    Add link
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id="nav-sign-in-label"
                    label="Sign-in label"
                    value={nav.signInLabel}
                    onChange={(signInLabel) => setNav({ ...nav, signInLabel })}
                  />
                  <TextField
                    id="nav-sign-in-href"
                    label="Sign-in link"
                    value={nav.signInHref}
                    onChange={(signInHref) => setNav({ ...nav, signInHref })}
                  />
                  <TextField
                    id="nav-sign-up-label"
                    label="Sign-up label"
                    value={nav.signUpLabel}
                    onChange={(signUpLabel) => setNav({ ...nav, signUpLabel })}
                  />
                  <TextField
                    id="nav-sign-up-href"
                    label="Sign-up link"
                    value={nav.signUpHref}
                    onChange={(signUpHref) => setNav({ ...nav, signUpHref })}
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  The navigation bar is page chrome: it renders at the top of
                  the page whatever its sort order, so moving it in the section
                  list changes nothing. Sign-in and sign-up are separate fields
                  rather than two more links because they render as the pill’s
                  trailing pair.
                </p>
              </div>
            ) : null}

            {type === "footer" ? (
              <div className="flex flex-col gap-3">
                <TextField
                  id="footer-brand-name"
                  label="Brand name"
                  value={footer.brandName}
                  onChange={(brandName) => setFooter({ ...footer, brandName })}
                />
                <TextAreaField
                  id="footer-brand-blurb"
                  label="Brand blurb"
                  value={footer.brandBlurb}
                  onChange={(brandBlurb) =>
                    setFooter({ ...footer, brandBlurb })
                  }
                />
                <TextField
                  id="footer-copyright"
                  label="Copyright line"
                  hint="Write {year} where the current year should go — the page substitutes it as it renders, so the line never needs bumping in January. It is not a typo."
                  value={footer.copyright}
                  onChange={(copyright) => setFooter({ ...footer, copyright })}
                />

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Columns</span>
                  {footer.columns.map((column, columnIndex) => (
                    <RepeatableEntry
                      key={columnIndex}
                      title={`Column ${columnIndex + 1}`}
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
                        label="Column title"
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
                        <span className="text-xs font-medium">Links</span>
                        {column.links.map((link, linkIndex) => (
                          <RepeatableEntry
                            key={linkIndex}
                            title={`Column ${columnIndex + 1} link ${
                              linkIndex + 1
                            }`}
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
                                label="Label"
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
                                label="URL"
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
                          Add link
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
                    Add column
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Columns read left to right in this order. The design is
                    four.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Legal links</span>
                  {footer.legalLinks.map((link, index) => (
                    <RepeatableEntry
                      key={index}
                      title={`Legal link ${index + 1}`}
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
                          label="Label"
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
                          label="URL"
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
                    Add legal link
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  The footer is page chrome: it renders at the bottom of the
                  page whatever its sort order, so moving it in the section list
                  changes nothing.
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="section-sort-order">Sort order</Label>
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
                  Active
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
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : isEditing
                  ? "Save section"
                  : "Create section"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
