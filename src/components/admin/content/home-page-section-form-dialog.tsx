"use client";

import { useState } from "react";

import type { ContentLocale } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the form and the
// API drifting apart.
import type { AdminHomePageSectionRow } from "@/app/api/admin/content/home-page-sections/route";
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
  HOME_PAGE_SECTION_TYPES,
  HOME_PAGE_SECTION_TYPE_LABELS,
  parseHomePageSection,
  type CategoryTilesContent,
  type DriverCtaContent,
  type FaqContent,
  type HeroContent,
  type HomePageSectionContent,
  type HomePageSectionType,
  type HowItWorksContent,
  type VehicleTypesContent,
} from "@/lib/admin/home-page-content";

/** Matches the bounds both section routes enforce, so the form fails first. */
const MIN_SORT_ORDER = 0;
const MAX_SORT_ORDER = 9999;

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

/** A labelled single-line field. */
function TextField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
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
 * Framing for one entry of a repeatable list, with its remove control. The
 * entry's own fields are passed in, since they differ per section type.
 */
function RepeatableEntry({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          {title}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
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

  // One draft per type. Each starts from the row being edited when the types
  // match, and from the copy currently on the public page otherwise — so a new
  // section is pre-filled with something real to edit rather than empty boxes.
  const [hero, setHero] = useState<HeroContent>(
    existing?.type === "hero"
      ? existing.content
      : DEFAULT_HOME_PAGE_CONTENT.hero,
  );
  const [categoryTiles, setCategoryTiles] = useState<CategoryTilesContent>(
    existing?.type === "category_tiles"
      ? existing.content
      : DEFAULT_HOME_PAGE_CONTENT.category_tiles,
  );
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypesContent>(
    existing?.type === "vehicle_types"
      ? existing.content
      : DEFAULT_HOME_PAGE_CONTENT.vehicle_types,
  );
  const [howItWorks, setHowItWorks] = useState<HowItWorksContent>(
    existing?.type === "how_it_works"
      ? existing.content
      : DEFAULT_HOME_PAGE_CONTENT.how_it_works,
  );
  const [faq, setFaq] = useState<FaqContent>(
    existing?.type === "faq" ? existing.content : DEFAULT_HOME_PAGE_CONTENT.faq,
  );
  const [driverCta, setDriverCta] = useState<DriverCtaContent>(
    existing?.type === "driver_cta"
      ? existing.content
      : DEFAULT_HOME_PAGE_CONTENT.driver_cta,
  );

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The draft belonging to the type currently selected. */
  function currentContent(): HomePageSectionContent {
    switch (type) {
      case "hero":
        return hero;
      case "category_tiles":
        return categoryTiles;
      case "vehicle_types":
        return vehicleTypes;
      case "how_it_works":
        return howItWorks;
      case "faq":
        return faq;
      case "driver_cta":
        return driverCta;
    }
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

    const content = currentContent();

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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
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
                <TextField
                  id="hero-headline-highlight"
                  label="Headline highlight"
                  value={hero.headlineHighlight}
                  onChange={(headlineHighlight) =>
                    setHero({ ...hero, headlineHighlight })
                  }
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
                  The stat figures beside the hero are counted from the live
                  vehicle taxonomy and are not editable here.
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
                  value={howItWorks.aside}
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

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Questions</span>
                  {faq.items.map((item, index) => (
                    <RepeatableEntry
                      key={index}
                      title={`Question ${index + 1}`}
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

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Points</span>
                  {driverCta.points.map((point, index) => (
                    <RepeatableEntry
                      key={index}
                      title={`Point ${index + 1}`}
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
