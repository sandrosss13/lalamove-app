"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import {
  AddCardDialog,
  type NewCardInput,
} from "@/components/home/add-card-dialog";
import {
  cardBrandChipClasses,
  cardBrandChipLabel,
} from "@/components/home/card-brand";

/**
 * The saved-card list on `/wallet`, and the only interactive part of that page.
 *
 * The page itself stays a server component and loads the initial list, so every
 * mutation here is a fetch followed by `router.refresh()` rather than a second
 * client-side copy of the list: the server component re-runs and hands this one
 * fresh props. That is why there is no `GET /api/saved-cards` call anywhere in
 * this file.
 *
 * **No payment gateway exists.** Nothing here is charged, and no card number or
 * security code passes through this component — `AddCardDialog` derives the
 * brand and the last four digits in the browser and hands over display metadata
 * only, which is posted verbatim.
 *
 * Colour rule: landing token utilities, never a hex literal and never a `dark:`
 * variant. `dark:` *does* match on `/wallet` now (the variant in `globals.css`
 * is app-wide, and the `--landing-*` tokens flip under `html.dark`); it stays
 * unwanted because each of those utilities already resolves to both themes on
 * its own. The two exceptions are semantic:
 * the brand chip (in `card-brand.ts`) and the destructive remove control, both
 * on Tailwind palette utilities, as the codebase already does for status pills.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The fields a saved-card row renders. Deliberately narrower than the row the
 * API returns: `createdAt` only ever decided the sort order, which the server
 * component has already applied, and `providerToken` is never selected at all.
 */
export type SavedCardView = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  holderName: string | null;
  isDefault: boolean;
};

/** Which mutation is in flight, and for which card. */
type PendingMutation = {
  cardId: string;
  action: "remove" | "default";
};

/** A failure attached to the row whose control caused it. */
type RowError = {
  cardId: string;
  message: string;
};

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const REMOVE_FAILED_FALLBACK = "Could not remove this card.";
const DEFAULT_FAILED_FALLBACK = "Could not make this card your default.";
const SAVE_FAILED_FALLBACK = "Could not save this card.";
const NETWORK_ERROR = "Network error. Check your connection and try again.";

/**
 * What the armed state promises. Two wordings because removing the default is
 * not the same act as removing any other card: the API promotes the next card
 * in the same transaction, and the client is owed that fact before they commit
 * to it rather than after.
 */
const REMOVE_ARMED_NOTE =
  "Click again to remove this card for good. There is no undo.";

const REMOVE_ARMED_DEFAULT_NOTE =
  "Click again to remove this card for good. There is no undo, and your next card becomes the default.";

const SECTION_HEADING_CLASSES =
  "text-[11px] font-semibold tracking-[0.1em] text-muted uppercase";

const ADD_CARD_BUTTON_CLASSES =
  "rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-60";

const MAKE_DEFAULT_BUTTON_CLASSES =
  "rounded-lg px-2 py-1.5 text-[13px] font-semibold text-paper transition-colors hover:text-accent disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Unarmed the remove control is a plain red label; armed it fills, because the
 * second click is the one that actually deletes and the two states must not be
 * mistakable for one another. Palette utilities rather than landing tokens —
 * the landing set carries no semantic colour — matching the house treatment at
 * `vehicles-detail-panel.tsx`.
 *
 * Both states carry an explicit dark half, because a palette utility is a fixed
 * hex and does not follow the theme. Note that the two halves move in opposite
 * directions, and deliberately:
 *
 * - Unarmed is red *text*, so it climbs the ramp in dark mode (`700` → `400`).
 *   `red-700` on a near-black page is barely distinguishable from the body text
 *   beside it, which would lose the whole "this one is destructive" signal.
 * - Armed is a filled red *plate* carrying white text, so it barely moves
 *   (`700` → `600`): a saturated red fill already separates from a dark page,
 *   and lightening it further would start to compete with the page's own
 *   brand orange. What does have to flip is the hover, which goes lighter
 *   rather than darker — on a dark ground "darker on hover" reads as the
 *   control receding, i.e. the opposite of the affordance intended.
 */
const REMOVE_BUTTON_BASE_CLASSES =
  "rounded-lg px-2 py-1.5 text-[13px] font-semibold transition-colors disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-60";

const REMOVE_UNARMED_CLASSES =
  "text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300";

const REMOVE_ARMED_CLASSES =
  "bg-red-700 px-3 text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500";

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The masked number a saved card is recognised by. The real number was never
 * sent here and is not stored, so the leading groups are placeholders rather
 * than a redaction of anything — which is also why every brand gets the same
 * four-by-four shape, including the fifteen-digit Amex.
 */
function maskedCardNumber(last4: string): string {
  return `•••• •••• •••• ${last4}`;
}

/** "12/29" from the stored one-based month and four-digit year. */
function formatExpiry(expMonth: number, expYear: number): string {
  return `${String(expMonth).padStart(2, "0")}/${String(expYear).slice(-2)}`;
}

/**
 * Pulls the API's own `{ error }` wording out of a failed response, so a client
 * reads the reason the server gave rather than a generic failure. Falls back
 * when the body is missing, unparseable or carries no message.
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
    typeof (body as { error: unknown }).error === "string" &&
    (body as { error: string }).error !== ""
  ) {
    return (body as { error: string }).error;
  }

  return fallback;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function SavedCardsPanel({ cards }: { cards: SavedCardView[] }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [armedCardId, setArmedCardId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMutation | null>(null);
  const [rowError, setRowError] = useState<RowError | null>(null);

  const headingId = useId();
  const noteId = `${headingId}-remove-note`;

  // One mutation at a time: two card writes racing each other would have the
  // list refreshed out from under the second, and a default promotion running
  // beside a removal has no defined winner.
  const busy = pending !== null;

  /** Disarms and clears the last failure — every interaction starts clean. */
  function resetTransientState() {
    setArmedCardId(null);
    setRowError(null);
  }

  async function handleMakeDefault(cardId: string) {
    // Interacting with any row disarms a remove armed on another one, so a
    // pending "Confirm removal" can never be left waiting somewhere off-screen.
    resetTransientState();
    setPending({ cardId, action: "default" });

    try {
      const response = await fetch(`/api/saved-cards/${cardId}/default`, {
        method: "POST",
      });

      if (!response.ok) {
        setRowError({
          cardId,
          message: await readErrorMessage(response, DEFAULT_FAILED_FALLBACK),
        });
        return;
      }

      // The server component owns the list; re-running it is what moves the
      // promoted card to the top and drops the old default's pill.
      router.refresh();
    } catch {
      setRowError({ cardId, message: NETWORK_ERROR });
    } finally {
      setPending(null);
    }
  }

  async function handleRemove(cardId: string) {
    // Removal is irreversible, so the first click only arms it — deliberately
    // not a browser `confirm()`, which would sit outside the page's own
    // language and cannot carry the note explaining what is about to happen.
    if (armedCardId !== cardId) {
      setRowError(null);
      setArmedCardId(cardId);
      return;
    }

    setRowError(null);
    setPending({ cardId, action: "remove" });

    try {
      const response = await fetch(`/api/saved-cards/${cardId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setRowError({
          cardId,
          message: await readErrorMessage(response, REMOVE_FAILED_FALLBACK),
        });
        // Disarmed on failure: the client should have to mean it again.
        setArmedCardId(null);
        return;
      }

      setArmedCardId(null);
      router.refresh();
    } catch {
      setRowError({ cardId, message: NETWORK_ERROR });
      setArmedCardId(null);
    } finally {
      setPending(null);
    }
  }

  /**
   * Receives display metadata only — brand, last four, expiry, holder name and
   * the default flag. Rejecting with the server's own wording is what the
   * dialog shows inline, so a `400` naming the offending field is not flattened
   * into a generic failure.
   */
  async function handleAddCard(card: NewCardInput) {
    const response = await fetch("/api/saved-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, SAVE_FAILED_FALLBACK));
    }

    router.refresh();
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className={SECTION_HEADING_CLASSES}>
          Saved cards
        </h2>
        <button
          type="button"
          onClick={() => {
            resetTransientState();
            setAddOpen(true);
          }}
          disabled={busy}
          className={ADD_CARD_BUTTON_CLASSES}
        >
          + Add card
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line bg-surface p-8 text-center">
          <p className="text-[14px] text-muted">
            No cards saved yet. Add a credit or debit card to pay for
            deliveries.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {cards.map((card) => {
            const armed = armedCardId === card.id;
            const removing =
              pending?.cardId === card.id && pending.action === "remove";
            const promoting =
              pending?.cardId === card.id && pending.action === "default";
            const cardDescription = `${card.brand} card ending ${card.last4}`;
            const error =
              rowError?.cardId === card.id ? rowError.message : null;

            return (
              <li
                key={card.id}
                className="rounded-[14px] border border-line bg-ink px-5 py-[18px]"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <span
                    aria-hidden="true"
                    className={cardBrandChipClasses(card.brand)}
                  >
                    {cardBrandChipLabel(card.brand)}
                  </span>

                  <div className="min-w-0">
                    <p className="font-price text-[15px] font-medium tracking-[0.02em] text-paper tabular-nums">
                      {/* The brand is on an `aria-hidden` chip, so the row's
                          own accessible text has to name it — otherwise a
                          screen-reader user hears four digits and no card. */}
                      <span className="sr-only">{card.brand} </span>
                      {maskedCardNumber(card.last4)}
                    </p>
                    <p className="mt-1 text-[12px] text-muted">
                      {card.holderName === null ? null : (
                        <>
                          <span className="break-words">{card.holderName}</span>
                          {" · "}
                        </>
                      )}
                      Expires{" "}
                      <span className="font-price tabular-nums">
                        {formatExpiry(card.expMonth, card.expYear)}
                      </span>
                    </p>
                  </div>

                  {card.isDefault ? (
                    <span className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-semibold tracking-[0.06em] text-accent uppercase">
                      Default
                    </span>
                  ) : null}

                  <div className="ml-auto flex items-center gap-1">
                    {/* Hidden on the card that is already the default: there is
                        nothing for the action to do there. */}
                    {card.isDefault ? null : (
                      <button
                        type="button"
                        onClick={() => {
                          void handleMakeDefault(card.id);
                        }}
                        disabled={busy}
                        aria-label={`Make default, ${cardDescription}`}
                        className={MAKE_DEFAULT_BUTTON_CLASSES}
                      >
                        {promoting ? "Saving…" : "Make default"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        void handleRemove(card.id);
                      }}
                      disabled={busy}
                      aria-label={
                        armed
                          ? `Confirm removal, ${cardDescription}`
                          : `Remove, ${cardDescription}`
                      }
                      // A disabled button leaves the tab order, so the armed
                      // note is pointed at from here rather than left to be
                      // found: it is read out with the button it belongs to.
                      aria-describedby={
                        armed ? `${noteId}-${card.id}` : undefined
                      }
                      className={`${REMOVE_BUTTON_BASE_CLASSES} ${
                        armed ? REMOVE_ARMED_CLASSES : REMOVE_UNARMED_CLASSES
                      }`}
                    >
                      {removing
                        ? "Removing…"
                        : armed
                          ? "Confirm removal"
                          : "Remove"}
                    </button>

                    {/* The way out of an armed state. Interacting with another
                        row also disarms, but a client with a single saved card
                        has no other row to interact with. */}
                    {armed && !removing ? (
                      <button
                        type="button"
                        onClick={() => setArmedCardId(null)}
                        disabled={busy}
                        aria-label={`Cancel removal, ${cardDescription}`}
                        className={MAKE_DEFAULT_BUTTON_CLASSES}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </div>

                {armed ? (
                  <p
                    id={`${noteId}-${card.id}`}
                    className="mt-2.5 text-[12px] leading-relaxed text-muted"
                  >
                    {card.isDefault && cards.length > 1
                      ? REMOVE_ARMED_DEFAULT_NOTE
                      : REMOVE_ARMED_NOTE}
                  </p>
                ) : null}

                {/* Inline, beside the control that failed — never an `alert()`.
                    Same red-text pair as `REMOVE_UNARMED_CLASSES`, for the same
                    reason: `red-700` all but disappears against a near-black
                    page, so the dark half climbs the ramp instead of darkening. */}
                {error === null ? null : (
                  <p
                    role="alert"
                    className="mt-2.5 text-[12px] text-red-700 dark:text-red-400"
                  >
                    {error}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AddCardDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        isFirstCard={cards.length === 0}
        onSubmit={handleAddCard}
      />
    </section>
  );
}
