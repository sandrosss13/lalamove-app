"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { ContentLocale } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the form and the
// API drifting apart.
import type { AdminBannerRow } from "@/app/api/admin/content/banners/route";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HOME_HERO_BANNER_PLACEMENT,
  HOME_PARTNER_LOGO_BANNER_PLACEMENT,
  HOME_SECONDARY_BANNER_PLACEMENT,
  MAX_HERO_BANNERS,
} from "@/lib/admin/home-page-content";

/**
 * `ContentLocale` rendered for humans, in the order the picker offers them.
 * `labelKey` is a full message path, resolved where the option renders.
 */
const LOCALE_OPTIONS: { value: ContentLocale; labelKey: string }[] = [
  { value: "KA", labelKey: "common.shared.georgianKa" },
  { value: "EN", labelKey: "common.shared.englishEn" },
];

/**
 * The placements the public site reads today, offered as autocomplete rather
 * than as a fixed list: `placement` is a free-form key by design (see the
 * `Banner` model doc), so adding a slot must stay a content change, not a code
 * change. The `datalist` suggests these without preventing anything else.
 *
 * Imported from the shared contract rather than restated as literals, so the
 * suggestions here and the keys the landing components actually read cannot
 * drift apart — the module is deliberately dependency-free and safe in a client
 * bundle.
 */
const DEFAULT_PLACEMENT = HOME_HERO_BANNER_PLACEMENT;
const PLACEMENT_SUGGESTIONS = [
  HOME_HERO_BANNER_PLACEMENT,
  HOME_SECONDARY_BANNER_PLACEMENT,
  HOME_PARTNER_LOGO_BANNER_PLACEMENT,
];

/** `datalist` id, referenced by the placement input's `list` attribute. */
const PLACEMENT_LIST_ID = "banner-placement-suggestions";

/**
 * Length caps on the optional card copy, matching what both banner routes
 * enforce, so the inputs stop at the limit instead of the save failing.
 */
const MAX_EYEBROW_LENGTH = 60;
const MAX_BODY_LENGTH = 280;
const MAX_CTA_LABEL_LENGTH = 40;

/** A trimmed optional copy field, or null when blank — the API's "unset". */
function toOptionalCopy(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Matches the bounds both banner routes enforce, so the form fails first. */
const MIN_SORT_ORDER = 0;
const MAX_SORT_ORDER = 9999;

export type BannerFormDialogProps = {
  /** The banner being edited, or null to create a new one. */
  banner: AdminBannerRow | null;
  /** Dismissed without saving — the parent drops its target. */
  onClose: () => void;
  /** The banner was created or updated; the parent should reload its list. */
  onCompleted: () => void;
};

/**
 * Pulls the API's `{ error }` message out of a failed response so staff see
 * *why* a save was refused (a malformed URL, a window that ends before it
 * starts, a role that may not edit content) rather than a generic failure.
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
 * A stored timestamp → the `YYYY-MM-DD` an `<input type="date">` takes.
 *
 * Read in UTC (the ISO string's own date part) to match how `toStartOfDayIso`
 * and `toEndOfDayIso` below write them back, so a date survives a round trip
 * through the form unchanged no matter where the browser is.
 */
function toDateInputValue(iso: string | null): string {
  return iso === null ? "" : iso.slice(0, 10);
}

/** A `YYYY-MM-DD` from the date input → the first instant of that UTC day. */
function toStartOfDayIso(value: string): string | null {
  return value === "" ? null : `${value}T00:00:00.000Z`;
}

/**
 * A `YYYY-MM-DD` from the date input → the *last* instant of that UTC day, so
 * the end of a window is inclusive: a banner set to end on the 30th runs
 * through the 30th rather than vanishing as it begins.
 */
function toEndOfDayIso(value: string): string | null {
  return value === "" ? null : `${value}T23:59:59.999Z`;
}

/**
 * The create/edit form for a `Banner`, shared by the "New Banner" button and
 * every row's Edit action so both write exactly the same fields.
 *
 * One component covers both directions rather than two nearly identical ones:
 * only the title, the endpoint and the HTTP method follow from whether
 * `banner` is null, and splitting them would mean keeping two forms in step
 * forever.
 *
 * It holds no `open` state. The parent mounts it only while a banner (or an
 * explicit "new") is selected, keyed by that target, so the fields start from
 * the right values for every banner instead of needing an effect to resync
 * them — closing is the parent dropping its target, which is also what
 * `onOpenChange` reports here.
 */
export function BannerFormDialog({
  banner,
  onClose,
  onCompleted,
}: BannerFormDialogProps) {
  const t = useTranslations();
  const isEditing = banner !== null;

  const [title, setTitle] = useState(banner?.title ?? "");
  const [locale, setLocale] = useState<ContentLocale>(banner?.locale ?? "KA");
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? "");
  const [linkUrl, setLinkUrl] = useState(banner?.linkUrl ?? "");
  // Card copy, rendered by the home page's offer cards (and the hero slides'
  // tag and text); other placements ignore it.
  const [eyebrow, setEyebrow] = useState(banner?.eyebrow ?? "");
  const [body, setBody] = useState(banner?.body ?? "");
  const [ctaLabel, setCtaLabel] = useState(banner?.ctaLabel ?? "");
  const [placement, setPlacement] = useState(
    banner?.placement ?? DEFAULT_PLACEMENT,
  );
  // Kept as a string so the box can be cleared while typing; parsed on submit.
  const [sortOrder, setSortOrder] = useState(String(banner?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(banner?.isActive ?? true);
  const [startsAt, setStartsAt] = useState(
    toDateInputValue(banner?.startsAt ?? null),
  );
  const [endsAt, setEndsAt] = useState(
    toDateInputValue(banner?.endsAt ?? null),
  );

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Both checks below are restated from the routes purely for the faster
    // feedback; the routes are what actually enforce them.

    // The image is an upload control rather than an `<input required>`, so the
    // browser cannot refuse an empty one on its own — without this, saving with
    // no image posts and comes back as a 400 naming a wire field instead of the
    // box on screen.
    if (imageUrl.trim() === "") {
      setError(t("admin.bannerFormDialog.addAnImageBeforeSavingThis"));
      return;
    }

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

    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        isEditing
          ? `/api/admin/content/banners/${banner.id}`
          : "/api/admin/content/banners",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          // Every field is sent in both directions: the dialog always shows the
          // complete banner, so a partial patch would only hide which values
          // the admin is actually confirming.
          body: JSON.stringify({
            title: title.trim(),
            locale,
            imageUrl: imageUrl.trim(),
            linkUrl: linkUrl.trim() === "" ? null : linkUrl.trim(),
            eyebrow: toOptionalCopy(eyebrow),
            body: toOptionalCopy(body),
            ctaLabel: toOptionalCopy(ctaLabel),
            placement: placement.trim(),
            sortOrder: parsedSortOrder,
            isActive,
            startsAt: toStartOfDayIso(startsAt),
            endsAt: toEndOfDayIso(endsAt),
          }),
        },
      );

      if (!response.ok) {
        setError(
          await readErrorMessage(
            response,
            isEditing
              ? t("admin.bannerFormDialog.couldNotSave")
              : t("admin.bannerFormDialog.couldNotCreate"),
          ),
        );
        setPending(false);
        return;
      }

      // The parent reloads and unmounts this dialog, so `pending` stays true —
      // the button must not flash back to its idle label in between.
      onCompleted();
    } catch {
      setError(t("common.shared.somethingWentWrongPleaseTryAgain"));
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Radix reports Escape, the overlay and the close button all through
        // here; none of them should interrupt a request already in flight.
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {isEditing
                ? t("admin.bannerFormDialog.editBanner")
                : t("admin.bannerFormDialog.newBanner")}
            </DialogTitle>
            <DialogDescription>
              {t("admin.bannerFormDialog.bannersAreShownOnThePublic")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="banner-title">{t("common.shared.title")}</Label>
              <Input
                id="banner-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("admin.bannerFormDialog.summerPromotion")}
                disabled={pending}
                required
                autoFocus
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-locale">
                  {t("common.shared.locale")}
                </Label>
                <Select
                  value={locale}
                  onValueChange={(value) => setLocale(value as ContentLocale)}
                  disabled={pending}
                >
                  <SelectTrigger id="banner-locale" className="w-full">
                    <SelectValue
                      placeholder={t("common.shared.selectALocale")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-placement">
                  {t("common.shared.placement")}
                </Label>
                <Input
                  id="banner-placement"
                  value={placement}
                  onChange={(event) => setPlacement(event.target.value)}
                  list={PLACEMENT_LIST_ID}
                  placeholder={t("admin.bannerFormDialog.homeHero")}
                  disabled={pending}
                  required
                />
                <datalist id={PLACEMENT_LIST_ID}>
                  {PLACEMENT_SUGGESTIONS.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground">
                  {t("admin.bannerFormDialog.placementHint", {
                    heroPlacement: HOME_HERO_BANNER_PLACEMENT,
                    maxHero: MAX_HERO_BANNERS,
                    partnerPlacement: HOME_PARTNER_LOGO_BANNER_PLACEMENT,
                    secondaryPlacement: HOME_SECONDARY_BANNER_PLACEMENT,
                  })}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="banner-image-url">
                {t("common.shared.imageUrl")}
              </Label>
              {/*
                Uploads the file straight to Storage and hands back the public
                URL, which is the only thing this form stores. It ships its own
                always-available "paste a URL instead" toggle, so an image
                already hosted elsewhere — and the whole field before the
                `site-media` bucket exists — still works.
              */}
              <AdminImageUpload
                id="banner-image-url"
                purpose="banners"
                value={imageUrl}
                onChange={setImageUrl}
                disabled={pending}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="banner-link-url">
                {t("common.shared.linkUrl")}
              </Label>
              <Input
                id="banner-link-url"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder={t("admin.bannerFormDialog.linkUrlPlaceholder")}
                disabled={pending}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-eyebrow">
                  {t("admin.bannerFormDialog.eyebrow")}
                </Label>
                <Input
                  id="banner-eyebrow"
                  value={eyebrow}
                  maxLength={MAX_EYEBROW_LENGTH}
                  onChange={(event) => setEyebrow(event.target.value)}
                  disabled={pending}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-cta-label">
                  {t("admin.bannerFormDialog.ctaLabel")}
                </Label>
                <Input
                  id="banner-cta-label"
                  value={ctaLabel}
                  maxLength={MAX_CTA_LABEL_LENGTH}
                  onChange={(event) => setCtaLabel(event.target.value)}
                  disabled={pending}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="banner-body">
                {t("admin.bannerFormDialog.body")}
              </Label>
              <Textarea
                id="banner-body"
                rows={2}
                value={body}
                maxLength={MAX_BODY_LENGTH}
                onChange={(event) => setBody(event.target.value)}
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.bannerFormDialog.cardCopyHint")}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-starts-at">
                  {t("admin.bannerFormDialog.startsOn")}
                </Label>
                <Input
                  id="banner-starts-at"
                  type="date"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                  disabled={pending}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-ends-at">
                  {t("admin.bannerFormDialog.endsOn")}
                </Label>
                <Input
                  id="banner-ends-at"
                  type="date"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                  disabled={pending}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-sort-order">
                  {t("common.shared.sortOrder")}
                </Label>
                <Input
                  id="banner-sort-order"
                  type="number"
                  inputMode="numeric"
                  min={MIN_SORT_ORDER}
                  max={MAX_SORT_ORDER}
                  step={1}
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value)}
                  disabled={pending}
                  required
                />
              </div>

              <div className="flex items-center gap-2 sm:self-end sm:pb-2">
                <Checkbox
                  id="banner-is-active"
                  checked={isActive}
                  onCheckedChange={(checked) => setIsActive(checked === true)}
                  disabled={pending}
                />
                <Label htmlFor="banner-is-active">
                  {t("common.shared.active")}
                </Label>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {t("admin.bannerFormDialog.leaveTheDatesEmptyForA")}
            </p>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
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
                  ? t("admin.bannerFormDialog.saveBanner")
                  : t("admin.bannerFormDialog.createBanner")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
