"use client";

import { useState } from "react";

import type { ContentLocale } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the form and the
// API drifting apart.
import type { AdminStaticPageRow } from "@/app/api/admin/content/pages/route";
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

/**
 * `ContentLocale` rendered for humans. Exported because the table shows the
 * same labels and the two must not drift.
 */
export const CONTENT_LOCALE_LABELS: Record<ContentLocale, string> = {
  KA: "Georgian",
  EN: "English",
};

/** Picker order — the site's default locale first. */
const CONTENT_LOCALE_OPTIONS: ContentLocale[] = ["EN", "KA"];

/**
 * What the dialog is doing. A discriminated union rather than a nullable page,
 * so "creating" and "editing a page that happens to be null" cannot be
 * confused.
 */
export type StaticPageFormTarget =
  { mode: "create" } | { mode: "edit"; page: AdminStaticPageRow };

type StaticPageFormDialogProps = {
  target: StaticPageFormTarget;
  /** Dismissed without saving — the parent drops its target. */
  onClose: () => void;
  /** The page was created or updated; the parent should reload its list. */
  onCompleted: () => void;
};

/** Rows the body textarea shows before it starts scrolling. */
const BODY_TEXTAREA_ROWS = 12;

/**
 * Pulls the API's `{ error }` message out of a failed response, so a duplicate
 * slug or an invalid one says exactly that instead of a generic failure.
 * Falls back when the body is missing or shaped unexpectedly, which is the case
 * for an infrastructure-level failure.
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
 * Creates or edits one `StaticPage`, used by `/admin/content/pages`.
 *
 * One component covers both directions rather than two nearly identical ones:
 * the fields are the same, and only the endpoint, method and copy follow from
 * `target.mode`. The body is a plain textarea holding raw HTML — the public
 * route renders it verbatim — because a rich-text editor is out of scope and
 * the authors here are vetted staff, not public users.
 *
 * It holds no `open` state. The parent mounts it only while a page is selected
 * (keyed by that page), so every field starts from the right values without an
 * effect to reset them — closing is the parent dropping its target, which is
 * also what `onOpenChange` reports here.
 */
export function StaticPageFormDialog({
  target,
  onClose,
  onCompleted,
}: StaticPageFormDialogProps) {
  const isEditing = target.mode === "edit";
  const existing = target.mode === "edit" ? target.page : null;

  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [locale, setLocale] = useState<ContentLocale>(existing?.locale ?? "EN");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [bodyHtml, setBodyHtml] = useState(existing?.bodyHtml ?? "");
  const [isPublished, setIsPublished] = useState(
    existing?.isPublished ?? false,
  );

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        existing
          ? `/api/admin/content/pages/${existing.id}`
          : "/api/admin/content/pages",
        {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, locale, title, bodyHtml, isPublished }),
        },
      );

      if (!response.ok) {
        // Reported inline rather than by closing the dialog: a duplicate slug
        // is something staff have to correct in the form still on screen.
        setError(
          await readErrorMessage(
            response,
            existing ? "Could not save this page." : "Could not create page.",
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
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit static page" : "New static page"}
            </DialogTitle>
            <DialogDescription>
              Each locale is its own page. The body is raw HTML and is rendered
              as-is at{" "}
              <span className="font-mono">/pages/{slug || "slug"}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="static-page-slug">Slug</Label>
                <Input
                  id="static-page-slug"
                  required
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="terms-of-service"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="static-page-locale">Locale</Label>
                <Select
                  value={locale}
                  onValueChange={(value) => setLocale(value as ContentLocale)}
                >
                  <SelectTrigger id="static-page-locale" className="w-full">
                    <SelectValue placeholder="Select a locale" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_LOCALE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {CONTENT_LOCALE_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="static-page-title">Title</Label>
              <Input
                id="static-page-title"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Terms of Service"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="static-page-body">Body (HTML)</Label>
              <Textarea
                id="static-page-body"
                required
                rows={BODY_TEXTAREA_ROWS}
                value={bodyHtml}
                onChange={(event) => setBodyHtml(event.target.value)}
                placeholder="<h2>Section</h2>&#10;<p>…</p>"
                className="max-h-96 font-mono text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="static-page-published"
                checked={isPublished}
                onCheckedChange={(checked) => setIsPublished(checked === true)}
              />
              <Label htmlFor="static-page-published">
                Published — visible to visitors
              </Label>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter showCloseButton={false}>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEditing ? "Save changes" : "Create page"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
