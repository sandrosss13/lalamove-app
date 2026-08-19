"use client";

import { useState } from "react";

import type { DiscountType } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops this form and the
// API drifting apart.
import type { AdminPromoCampaignRow } from "@/app/api/admin/finance/promo-campaigns/route";
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

/**
 * `DiscountType` rendered for humans.
 *
 * Exported because the campaigns table renders the same labels and the two must
 * not drift; it lives here, next to the picker, because this is the only place
 * the *ordering* also matters.
 */
export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  PERCENTAGE: "Percentage off",
  FIXED_AMOUNT: "Fixed amount off",
};

/** Picker order — percentage first, since it is the common case. */
const DISCOUNT_TYPE_OPTIONS: DiscountType[] = ["PERCENTAGE", "FIXED_AMOUNT"];

/**
 * Mirrors `PROMO_CODE_PATTERN` on both routes, which reject anything else. The
 * dialog upper-cases as the admin types, so this only ever fails on stray
 * punctuation or a length problem.
 */
const PROMO_CODE_PATTERN = /^[A-Z0-9]{3,32}$/;

/** Mirrors `MAX_PERCENTAGE_DISCOUNT` on both routes. */
const MAX_PERCENTAGE_DISCOUNT = 100;

/**
 * Pulls the API's `{ error }` message out of a failed response — a taken code
 * or a rejected discount says so, instead of showing the same generic failure
 * as a dropped connection.
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
 * An ISO timestamp as the `YYYY-MM-DD` value an `<input type="date">` expects.
 *
 * Slicing the ISO string reads the *UTC* day, which is the same day
 * `toStartOfDay`/`toEndOfDay` below wrote — so a campaign shows the dates it
 * was saved with regardless of where the browser is.
 */
function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * A `YYYY-MM-DD` picker value as the first instant of that UTC day.
 *
 * UTC rather than local midnight so two admins in different time zones editing
 * the same campaign see and store the same window, and so the round trip
 * through `toDateInputValue` is lossless.
 */
function toStartOfDay(value: string): string {
  return `${value}T00:00:00.000Z`;
}

/**
 * A `YYYY-MM-DD` picker value as the *last* instant of that UTC day.
 *
 * The end date is inclusive — an admin picking the 30th means the code works
 * through the 30th — and this is also what makes a single-day campaign
 * expressible at all, since the routes require `startsAt < endsAt`.
 */
function toEndOfDay(value: string): string {
  return `${value}T23:59:59.999Z`;
}

type PromoCampaignFormDialogProps = {
  /** The campaign being edited, or null to author a new one. */
  campaign: AdminPromoCampaignRow | null;
  /** Dismissed without saving — the parent closes the dialog. */
  onClose: () => void;
  /** A campaign was created or updated; the parent should reload its list. */
  onSaved: () => void;
};

/**
 * The create/edit form for a discount code.
 *
 * One component covers both directions rather than two nearly identical ones:
 * the copy, the HTTP method and the endpoint all follow from whether a
 * `campaign` was passed, and splitting them would mean keeping two forms in
 * step forever.
 *
 * It holds no `open` state. The parent mounts it only while it should be shown
 * (keyed by campaign), so every open starts from the right initial values
 * instead of needing an effect to reset them — closing is the parent dropping
 * it, which is also what `onOpenChange` reports here.
 *
 * Every rule checked below is checked again by the route. This copy exists for
 * the faster feedback, not as the boundary — see the doc comments on the two
 * `route.ts` files for the enforcing copies.
 */
export function PromoCampaignFormDialog({
  campaign,
  onClose,
  onSaved,
}: PromoCampaignFormDialogProps) {
  const isEditing = campaign !== null;

  const [code, setCode] = useState(campaign?.code ?? "");
  const [discountType, setDiscountType] = useState<DiscountType>(
    campaign?.discountType ?? "PERCENTAGE",
  );
  // The numeric fields are held as strings: an `<input type="number">` hands
  // back a string anyway, and parsing on every keystroke would fight the admin
  // mid-entry (an empty box or a lone "." is not yet a number).
  const [discountValue, setDiscountValue] = useState(
    campaign ? String(campaign.discountValue) : "",
  );
  const [startsAt, setStartsAt] = useState(
    campaign ? toDateInputValue(campaign.startsAt) : "",
  );
  const [endsAt, setEndsAt] = useState(
    campaign ? toDateInputValue(campaign.endsAt) : "",
  );
  const [usageLimit, setUsageLimit] = useState(
    campaign?.usageLimit === null || campaign?.usageLimit === undefined
      ? ""
      : String(campaign.usageLimit),
  );
  const [isActive, setIsActive] = useState(campaign?.isActive ?? true);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Everything the form can decide on its own, in the order the fields appear —
   * so the message always points at the first thing the admin has to fix.
   * Returns the message, or null when the form is submittable.
   */
  function validate(): string | null {
    const normalizedCode = code.trim().toUpperCase();

    if (!PROMO_CODE_PATTERN.test(normalizedCode)) {
      return "A code must be 3–32 characters, letters and numbers only (e.g. SUMMER25).";
    }

    const parsedValue = Number(discountValue);

    if (discountValue.trim() === "" || !Number.isFinite(parsedValue)) {
      return "Enter a discount value.";
    }

    if (discountType === "PERCENTAGE") {
      if (parsedValue <= 0 || parsedValue > MAX_PERCENTAGE_DISCOUNT) {
        return `A percentage discount must be greater than 0 and at most ${MAX_PERCENTAGE_DISCOUNT}.`;
      }
    } else if (parsedValue <= 0) {
      return "A fixed-amount discount must be greater than 0.";
    }

    if (startsAt === "" || endsAt === "") {
      return "Pick a start and an end date.";
    }

    // Both are `YYYY-MM-DD`, so a plain string comparison orders them. The end
    // date is inclusive, hence `>` rather than `>=`: a one-day campaign is
    // legitimate, and `toEndOfDay` keeps it valid for the route's
    // `startsAt < endsAt` check.
    if (startsAt > endsAt) {
      return "The start date must be on or before the end date.";
    }

    if (usageLimit.trim() !== "") {
      const parsedLimit = Number(usageLimit);

      if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
        return "A usage limit must be a whole number of 1 or more, or left blank.";
      }
    }

    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        isEditing
          ? `/api/admin/finance/promo-campaigns/${campaign.id}`
          : "/api/admin/finance/promo-campaigns",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          // The edit case sends every field rather than a diff: the form always
          // holds the campaign's full state, and a complete body is a valid
          // patch, so there is nothing to gain from computing the difference.
          body: JSON.stringify({
            code: code.trim().toUpperCase(),
            discountType,
            discountValue: Number(discountValue),
            startsAt: toStartOfDay(startsAt),
            endsAt: toEndOfDay(endsAt),
            usageLimit:
              usageLimit.trim() === "" ? null : Number.parseInt(usageLimit, 10),
            isActive,
          }),
        },
      );

      if (!response.ok) {
        setError(
          await readErrorMessage(
            response,
            isEditing
              ? "Could not save this campaign."
              : "Could not create this campaign.",
          ),
        );
        setPending(false);
        return;
      }

      // The parent reloads and unmounts this dialog, so `pending` stays true —
      // the button must not flash back to its idle label in between.
      onSaved();
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
              {isEditing ? "Edit campaign" : "New campaign"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Changes apply to every redemption from now on. Redemptions already recorded are unaffected."
                : "Clients redeem this code at checkout while it is active and inside its date window."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-code">Code</Label>
              <Input
                id="promo-code"
                required
                value={code}
                // Upper-cased as it is typed, so what the admin sees is exactly
                // what is stored and what a client will have to type back.
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="SUMMER25"
                className="font-mono"
                disabled={pending}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Letters and numbers only, 3–32 characters.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-discount-type">Discount type</Label>
              <Select
                value={discountType}
                onValueChange={(value) =>
                  setDiscountType(value as DiscountType)
                }
                disabled={pending}
              >
                <SelectTrigger id="promo-discount-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISCOUNT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {DISCOUNT_TYPE_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-discount-value">
                {discountType === "PERCENTAGE"
                  ? "Percentage off"
                  : "Amount off"}
              </Label>
              <Input
                id="promo-discount-value"
                type="number"
                required
                min={0}
                {...(discountType === "PERCENTAGE"
                  ? { max: MAX_PERCENTAGE_DISCOUNT }
                  : {})}
                step="0.01"
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value)}
                placeholder={discountType === "PERCENTAGE" ? "25" : "15.00"}
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">
                {discountType === "PERCENTAGE"
                  ? `Greater than 0, up to ${MAX_PERCENTAGE_DISCOUNT}.`
                  : "Greater than 0, in whole currency units."}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="promo-starts-at">Starts</Label>
                <Input
                  id="promo-starts-at"
                  type="date"
                  required
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                  disabled={pending}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="promo-ends-at">Ends</Label>
                <Input
                  id="promo-ends-at"
                  type="date"
                  required
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                  disabled={pending}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-usage-limit">Usage limit (optional)</Label>
              <Input
                id="promo-usage-limit"
                type="number"
                min={1}
                step="1"
                value={usageLimit}
                onChange={(event) => setUsageLimit(event.target.value)}
                placeholder="Unlimited"
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for unlimited redemptions.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="promo-is-active"
                checked={isActive}
                // Radix reports an indeterminate state too, which this checkbox
                // never enters — comparing against `true` keeps the state a
                // plain boolean.
                onCheckedChange={(checked) => setIsActive(checked === true)}
                disabled={pending}
              />
              <Label htmlFor="promo-is-active">Active</Label>
            </div>

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
                  ? "Save changes"
                  : "Create campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
