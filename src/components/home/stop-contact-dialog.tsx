"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

import { parseFloorInput } from "@/components/home/booking-pricing";
import {
  EMPTY_STOP_CONTACT,
  type StopContact,
} from "@/components/home/stop-contact";
import { STOP_CONTACT_MAX_LENGTHS } from "@/lib/orders/stop-contact-limits";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The "Contact Info" popup: who the driver should ask for at one end of the
 * route, and where in the building to find them. What it asks depends on the
 * account type (see `stop-contact.ts`): an individual also gives the floor —
 * which is the floor the stop's helpers are priced at — and a comment; a
 * business gives name, phone, building and entrance only.
 *
 * Built on the shadcn `Dialog` (Radix) rather than the hand-rolled fixed-inset
 * overlay the design handoff prescribes. The handoff warns against
 * translate-centring, but that warning describes a conflict between its own
 * `animation-fill-mode: both` keyframes and a translate transform — Radix plus
 * `tw-animate-css` has no such conflict, and `DialogContent` already centres
 * that way in 20+ components here. Hand-rolling would mean re-implementing the
 * focus trap, scroll lock, `aria-modal` and Escape handling Radix gets right.
 *
 * The primitive is retinted to the landing token set at the call site, the same
 * way the booking form retints the date `Popover` around the `Calendar`: its
 * defaults (`bg-popover`, `text-popover-foreground`, `ring-foreground/10`) come
 * from the shadcn palette, which this page does not use.
 *
 * Colour rule, as everywhere in the booking flow: landing token utilities only
 * (`bg-ink`, `text-paper`, `text-muted`, `border-line`, the accent pair) — never
 * a hex literal, and never a `dark:` variant. `dark:` *does* match here now (the
 * variant in `globals.css` is app-wide, and the `--landing-*` tokens flip under
 * `html.dark`); it stays unwanted because each of those utilities already
 * resolves to both themes on its own.
 *
 * The component is fully controlled and owns no persistence: it reports a saved
 * contact upwards and nothing else. Cancel, Escape and a backdrop click all
 * close without reporting, and the draft is re-seeded from `initialValue` on
 * every open, so a discarded edit leaves no trace and re-opening a stop shows
 * whatever was last saved for it.
 */

export type { StopContact };

export type StopContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "pickup" numbers the badge 1, "dropoff" numbers it 2. */
  stop: "pickup" | "dropoff";
  /** The selected address, shown so the client knows which stop this is. */
  address: string;
  /** INDIVIDUAL also gets the floor and comment fields; BUSINESS does not. */
  accountType: "INDIVIDUAL" | "BUSINESS";
  /** Seeds the draft each time the dialog opens. */
  initialValue: StopContact | null;
  /** The stop's current floor (0 = ground), seeding the individual's field. */
  initialFloor: number;
  /**
   * Reports the saved contact and — for an individual — the floor typed
   * (empty = 0, the ground floor); `null` for a business, whose floor is
   * not asked here.
   */
  onSave: (contact: StopContact, floor: number | null) => void;
};

/** Georgian country code, fixed: the app books journeys within Georgia. */
const PHONE_COUNTRY_CODE = "+995";

/**
 * What each stop is called in the dialog's accessible name and badge.
 * `accessibleNameKey` is a key in `home.stopContactDialog`, translated at render.
 */
const STOP_COPY = {
  pickup: { accessibleNameKey: "contactInfoForPickup", badge: "1" },
  dropoff: { accessibleNameKey: "contactInfoForDropoff", badge: "2" },
} as const;

/**
 * The shared box geometry of the single-line fields. Applied to the input itself for
 * the two plain fields, and to the *container* of the phone field, which holds
 * a static dialling code beside a borderless input.
 */
const FIELD_BOX_CLASSES =
  "h-12 w-full rounded-lg border border-line bg-ink px-3.5 text-[15px] text-paper transition-colors outline-none";

/**
 * Focus treatment for a field: an accent border plus a 3px accent ring at 20%
 * opacity — the form's existing idiom (`NATIVE_FIELD_CLASSES` in
 * `booking-form.tsx`), expressed in tokens rather than the handoff's raw
 * accent-at-20% value.
 */
const FIELD_FOCUS_CLASSES =
  "focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20";

/**
 * The same treatment for the phone row, where the focusable element is nested:
 * the container draws the ring on the inner input's behalf, the way the crew
 * picker's cells draw one for their `sr-only` radios.
 */
const FIELD_FOCUS_WITHIN_CLASSES =
  "has-[:focus-visible]:border-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/20";

const PLACEHOLDER_CLASSES = "placeholder:text-muted";

/** The floor field's text for a stored floor: empty for the ground floor. */
function floorText(floor: number): string {
  return floor > 0 ? String(floor) : "";
}

export function StopContactDialog({
  open,
  onOpenChange,
  stop,
  address,
  accountType,
  initialValue,
  initialFloor,
  onSave,
}: StopContactDialogProps) {
  const t = useTranslations("home.stopContactDialog");
  const tShared = useTranslations("common.shared");
  const isIndividual = accountType === "INDIVIDUAL";
  const floorHintId = useId();
  const [draft, setDraft] = useState<StopContact>(
    initialValue ?? EMPTY_STOP_CONTACT,
  );
  const [floorDraft, setFloorDraft] = useState(() => floorText(initialFloor));

  /* Re-seed the draft on the closed → open transition, adjusting state during
     render rather than in an effect. An effect depending on `initialValue`
     would reset the fields under the client's cursor whenever the parent
     re-rendered with a fresh object literal; keying off the `open` transition
     resets exactly once per opening, whatever the prop's identity. */
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      setDraft(initialValue ?? EMPTY_STOP_CONTACT);
      setFloorDraft(floorText(initialFloor));
    }
  }

  const { accessibleNameKey, badge } = STOP_COPY[stop];

  function handleSave() {
    onSave(draft, isIndividual ? parseFloorInput(floorDraft) : null);
    onOpenChange(false);
  }

  function setField(field: keyof StopContact, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `showCloseButton={false}`: the design closes through Cancel, and the
          primitive's X is a shadcn `Button`, whose `hover:bg-accent` would
          resolve to this palette's green accent rather than a neutral hover.
          Escape and a backdrop click still close the dialog.

          `sm:max-w-full` and `ring-0` neutralise defaults rather than add
          anything — `sm:max-w-sm` would cap the panel at 384px, below the
          design's 420px, and the default `ring-foreground/10` follows the
          system colour scheme, which nothing else on this page does.

          Enter is handled here, and deliberately never leaves the dialog. This
          panel is rendered from inside the booking form's `<form
          onKeyDown={handleFormKeyDown}>`: Radix portals it to `document.body`,
          but React dispatches synthetic events along the *React* tree, so an
          Enter typed in a contact field would otherwise reach that handler and
          fire a live `handleCalculate()` — a real `POST
          /api/pricing/estimate` from inside an open modal, reachable because
          the dialog opens on choosing a dropoff suggestion, by which point both
          addresses are set. `stopPropagation` on the synthetic event is what
          ends that cross-portal walk; `preventDefault` alone does not. Radix
          listens for Escape in the capture phase on the document, so closing is
          unaffected.

          Enter then does what the visible primary action does — Save — which is
          also the dialog's only keyboard path to it. The button guard keeps
          Enter on a focused Cancel or Save doing what that button says: those
          activate natively, and only need the propagation stopped. */}
      <DialogContent
        showCloseButton={false}
        onKeyDown={(event) => {
          if (event.key !== "Enter") {
            return;
          }

          event.stopPropagation();

          // A newline in the comment, not a save.
          if (
            event.target instanceof HTMLButtonElement ||
            event.target instanceof HTMLTextAreaElement
          ) {
            return;
          }

          event.preventDefault();
          handleSave();
        }}
        className="grid w-[420px] max-w-full gap-0 rounded-[14px] border border-line bg-ink p-[26px] text-paper ring-0 sm:max-w-full"
      >
        {/* The dialog's real accessible name: it says *which* stop is being
            filled in, which the styled heading below cannot, because it reads
            the same for both. */}
        <DialogTitle className="sr-only">{t(accessibleNameKey)}</DialogTitle>

        <div className="mb-5 flex items-center gap-3">
          {/* Decorative: the accessible name already carries which stop this
              is, so announcing a bare numeral would only add noise. */}
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-on-accent"
          >
            {badge}
          </span>
          <span
            aria-hidden="true"
            className="text-[13px] font-semibold tracking-[0.1em] text-muted uppercase"
          >
            {t("contactInfo")}
          </span>
        </div>

        {/* Not in the visual reference — added so the client can tell the two
            stops apart, and doubling as the dialog's description. */}
        <DialogDescription className="mb-4 text-[13px] leading-[1.4] text-muted">
          {address}
        </DialogDescription>

        {/* Deliberately not a `<form>`: the dialog portals to `document.body`,
            but React events still travel the component tree, so a DOM `submit`
            raised here — a click on any `type="submit"` button inside it —
            would propagate into the booking form's own `onSubmit` and place the
            order. With no form there is no submit to raise: the buttons below
            are `type="button"` and call `handleSave` directly. The other path
            across the portal is `keydown`, which is stopped on `DialogContent`
            above (the booking form's Enter handler re-quotes; it never
            books). */}
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={draft.name}
            onChange={(event) => setField("name", event.target.value)}
            placeholder={tShared("name")}
            aria-label={tShared("name")}
            autoComplete="off"
            maxLength={STOP_CONTACT_MAX_LENGTHS.name}
            className={`${FIELD_BOX_CLASSES} ${PLACEHOLDER_CLASSES} ${FIELD_FOCUS_CLASSES}`}
          />

          {/* The box is the container; the input inside it is borderless so the
              dialling code reads as part of the same field. */}
          <div
            className={`${FIELD_BOX_CLASSES} ${FIELD_FOCUS_WITHIN_CLASSES} flex items-center`}
          >
            <span aria-hidden="true" className="shrink-0 text-muted">
              {PHONE_COUNTRY_CODE}
            </span>
            <input
              type="text"
              inputMode="tel"
              value={draft.phone}
              onChange={(event) => setField("phone", event.target.value)}
              placeholder={t("phoneNumber")}
              aria-label={t("phoneNumber")}
              autoComplete="off"
              maxLength={STOP_CONTACT_MAX_LENGTHS.phone}
              className={`${PLACEHOLDER_CLASSES} h-full w-full min-w-0 border-0 bg-transparent pl-3 text-[15px] text-paper outline-none`}
            />
          </div>

          <input
            type="text"
            value={draft.buildingName}
            onChange={(event) => setField("buildingName", event.target.value)}
            placeholder={t("buildingName")}
            aria-label={t("buildingName")}
            autoComplete="off"
            maxLength={STOP_CONTACT_MAX_LENGTHS.buildingName}
            className={`${FIELD_BOX_CLASSES} ${PLACEHOLDER_CLASSES} ${FIELD_FOCUS_CLASSES}`}
          />

          {/* Entrance and floor share a row for an individual — both short —
              and the entrance takes the full width for a business, which is
              not asked the floor here (its floor is on the helper step). */}
          <div className={isIndividual ? "grid grid-cols-2 gap-3" : "contents"}>
            <input
              type="text"
              value={draft.entrance}
              onChange={(event) => setField("entrance", event.target.value)}
              placeholder={t("entrance")}
              aria-label={t("entrance")}
              autoComplete="off"
              maxLength={STOP_CONTACT_MAX_LENGTHS.entrance}
              className={`${FIELD_BOX_CLASSES} ${PLACEHOLDER_CLASSES} ${FIELD_FOCUS_CLASSES} min-w-0`}
            />
            {isIndividual ? (
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                value={floorDraft}
                onChange={(event) =>
                  setFloorDraft(event.target.value.replace(/\D/g, ""))
                }
                placeholder={t("floorPlaceholder")}
                aria-label={t("floor")}
                aria-describedby={floorHintId}
                autoComplete="off"
                className={`${FIELD_BOX_CLASSES} ${PLACEHOLDER_CLASSES} ${FIELD_FOCUS_CLASSES} min-w-0 font-price tabular-nums`}
              />
            ) : null}
          </div>
          {isIndividual ? (
            <span id={floorHintId} className="sr-only">
              {t("floorPlaceholder")}
            </span>
          ) : null}

          {isIndividual ? (
            <textarea
              value={draft.comment}
              onChange={(event) => setField("comment", event.target.value)}
              placeholder={t("commentPlaceholder")}
              aria-label={t("comment")}
              autoComplete="off"
              rows={3}
              maxLength={STOP_CONTACT_MAX_LENGTHS.comment}
              className={`${PLACEHOLDER_CLASSES} ${FIELD_FOCUS_CLASSES} min-h-[84px] w-full resize-y rounded-lg border border-line bg-ink px-3.5 py-3 text-[15px] leading-snug text-paper transition-colors outline-none`}
            />
          ) : null}
        </div>

        <p className="mt-3 text-[12px] text-muted">
          {t("allFieldsAreOptional")}
        </p>

        <div className="mt-[22px] flex items-center justify-end gap-4">
          {/* Cancel discards the draft simply by closing: the next open
              re-seeds from `initialValue`, so nothing typed here survives. */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-2 py-3 text-[15px] font-semibold text-accent transition-colors hover:text-accent-hover"
          >
            {tShared("cancel")}
          </button>
          {/* Never disabled: every field is optional and none is validated
              beyond its length, so there is no state in which saving is
              refused. */}
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-accent px-8 py-[13px] text-[15px] font-semibold text-on-accent transition-colors hover:bg-accent-hover"
          >
            {t("save")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The way back into a stop's Contact Info after the dialog has closed (it
 * opens by itself only when an address suggestion is picked). A quiet text
 * button under the address field: "Add contact info" until something is
 * saved, then a one-line summary of it. For an individual the summary also
 * names the floor, since that floor prices the stop's helpers.
 */
export function StopContactSummaryButton({
  contact,
  floor,
  accountType,
  onClick,
  disabled = false,
}: {
  contact: StopContact | null;
  floor: number;
  accountType: "INDIVIDUAL" | "BUSINESS";
  onClick: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("home.stopContactDialog");
  const tStopInfo = useTranslations("common.stopInfo");
  const parts = contact
    ? [contact.name, contact.phone, contact.buildingName, contact.entrance]
        .map((part) => part.trim())
        .filter((part) => part !== "")
    : [];
  if (accountType === "INDIVIDUAL" && floor > 0) {
    parts.push(tStopInfo("floorValue", { floor }));
  }
  const summary = parts.join(" · ");

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="-mt-2 w-fit max-w-full truncate text-left text-xs font-medium text-accent transition-colors hover:text-accent-hover disabled:opacity-60"
    >
      {summary === ""
        ? t("addContactInfo")
        : t("contactInfoSummary", { summary })}
    </button>
  );
}
