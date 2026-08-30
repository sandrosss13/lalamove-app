"use client";

import { useState } from "react";

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

/** `ContentLocale` rendered for humans, in the order the picker offers them. */
const LOCALE_OPTIONS: { value: ContentLocale; label: string }[] = [
  { value: "KA", label: "Georgian (KA)" },
  { value: "EN", label: "English (EN)" },
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
  const isEditing = banner !== null;

  const [title, setTitle] = useState(banner?.title ?? "");
  const [locale, setLocale] = useState<ContentLocale>(banner?.locale ?? "KA");
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? "");
  const [linkUrl, setLinkUrl] = useState(banner?.linkUrl ?? "");
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
      setError("Add an image before saving this banner.");
      return;
    }

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
              ? "Could not save this banner."
              : "Could not create this banner.",
          ),
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
        // Radix reports Escape, the overlay and the close button all through
        // here; none of them should interrupt a request already in flight.
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit banner" : "New banner"}
            </DialogTitle>
            <DialogDescription>
              Banners are shown on the public site in the placement and locale
              you pick, in sort order, while they are active and inside their
              date window.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="banner-title">Title</Label>
              <Input
                id="banner-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Summer promotion"
                disabled={pending}
                required
                autoFocus
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-locale">Locale</Label>
                <Select
                  value={locale}
                  onValueChange={(value) => setLocale(value as ContentLocale)}
                  disabled={pending}
                >
                  <SelectTrigger id="banner-locale" className="w-full">
                    <SelectValue placeholder="Select a locale" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-placement">Placement</Label>
                <Input
                  id="banner-placement"
                  value={placement}
                  onChange={(event) => setPlacement(event.target.value)}
                  list={PLACEMENT_LIST_ID}
                  placeholder="home_hero"
                  disabled={pending}
                  required
                />
                <datalist id={PLACEMENT_LIST_ID}>
                  {PLACEMENT_SUGGESTIONS.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground">
                  {HOME_HERO_BANNER_PLACEMENT} feeds the homepage carousel (max{" "}
                  {MAX_HERO_BANNERS} active per locale),{" "}
                  {HOME_PARTNER_LOGO_BANNER_PLACEMENT} feeds the partner
                  marquee, {HOME_SECONDARY_BANNER_PLACEMENT} is the legacy
                  inline slot.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="banner-image-url">Image URL</Label>
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
              <Label htmlFor="banner-link-url">Link URL</Label>
              <Input
                id="banner-link-url"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="/services (optional)"
                disabled={pending}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-starts-at">Starts on</Label>
                <Input
                  id="banner-starts-at"
                  type="date"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                  disabled={pending}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-ends-at">Ends on</Label>
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
                <Label htmlFor="banner-sort-order">Sort order</Label>
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
                <Label htmlFor="banner-is-active">Active</Label>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Leave the dates empty for a banner with no start or end. Dates are
              read in UTC and both ends are inclusive.
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
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : isEditing
                  ? "Save banner"
                  : "Create banner"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
