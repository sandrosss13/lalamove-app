"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { SavedAddressInput } from "@/lib/saved-addresses/contract";

import { SavedAddressContactSummary } from "./contact-summary";
import { SavedAddressLabelField } from "./label-field";
import {
  readErrorMessage,
  readSavedAddressList,
  unsavedEnds,
} from "./saved-address-format";

/**
 * "Save these addresses for next time?" — the card under a signed-in client's
 * booking confirmation on `/checkout/[id]/success`.
 *
 * One row per end of the route, each a checkbox (pre-ticked), the address, the
 * Contact Info the client typed for it and a label. Saving POSTs every ticked
 * row to `/api/saved-addresses`; "Not now" just hides the card.
 *
 * Rows whose address the client has already saved are dropped before anything
 * renders, so the card waits for `GET /api/saved-addresses` rather than
 * flashing rows that then disappear. If nothing is left, or the list cannot be
 * read as this client (401/403), the card never appears at all.
 *
 * The page renders this only for an account order — a guest has no address
 * book to save into — and passes plain serialisable props, never the order.
 */

/** One end of the just-booked route, as the success page hands it over. */
export type SaveAddressesPromptEnd = {
  end: "pickup" | "dropoff";
  /** Everything but the label, which the client picks here. */
  input: Omit<SavedAddressInput, "label">;
};

/** Per-row choices the client makes on the card. */
type RowState = { checked: boolean; label: string };

type Phase =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "ready" }
  | { kind: "saving" }
  | { kind: "saved" };

const SAVE_BUTTON_CLASSES =
  "rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:pointer-events-auto disabled:cursor-not-allowed disabled:bg-line disabled:text-muted";

const SECONDARY_BUTTON_CLASSES =
  "rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60";

export function SaveAddressesPrompt({
  ends,
}: {
  ends: SaveAddressesPromptEnd[];
}) {
  const t = useTranslations("savedAddresses.prompt");
  const headingId = useId();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [visibleEnds, setVisibleEnds] = useState<SaveAddressesPromptEnd[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let saved: string[] = [];

      try {
        const response = await fetch("/api/saved-addresses");

        // Not a client account after all (or signed out since rendering):
        // there is nowhere to save to, so the card stays away.
        if (response.status === 401 || response.status === 403) {
          if (!cancelled) setPhase({ kind: "hidden" });
          return;
        }

        if (response.ok) {
          const list = readSavedAddressList(
            await response.json().catch(() => null),
          );
          saved = list?.map((row) => row.address) ?? [];
        }
      } catch {
        // A failed read only means the de-duplication is skipped: offering an
        // address that is already saved is harmless, because the API folds a
        // duplicate POST into the existing row instead of adding a second one.
      }

      if (cancelled) return;

      const remaining = unsavedEnds(ends, saved);
      setVisibleEnds(remaining);
      setRows(
        Object.fromEntries(
          remaining.map((end) => [end.end, { checked: true, label: "" }]),
        ),
      );
      setPhase(remaining.length === 0 ? { kind: "hidden" } : { kind: "ready" });
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [ends]);

  function updateRow(end: string, patch: Partial<RowState>) {
    setRows((current) => ({
      ...current,
      [end]: { checked: true, label: "", ...current[end], ...patch },
    }));
  }

  const toSave = visibleEnds.filter((end) => rows[end.end]?.checked);

  async function handleSave() {
    setError(null);
    setPhase({ kind: "saving" });

    // One request per row, in order, so a 409 at the limit stops before the
    // next one and the rows already saved can be taken off the card.
    for (const end of toSave) {
      try {
        const response = await fetch("/api/saved-addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...end.input,
            label: rows[end.end]?.label.trim() ?? "",
          } satisfies SavedAddressInput),
        });

        if (!response.ok) {
          setError(await readErrorMessage(response, t("saveFailed")));
          setPhase({ kind: "ready" });
          return;
        }
      } catch {
        setError(t("networkError"));
        setPhase({ kind: "ready" });
        return;
      }

      // Saved: the row leaves the card, so a retry after a later failure
      // cannot post it twice.
      setVisibleEnds((current) => current.filter((e) => e.end !== end.end));
    }

    setPhase({ kind: "saved" });
  }

  if (phase.kind === "loading" || phase.kind === "hidden") {
    return null;
  }

  if (phase.kind === "saved") {
    return (
      <section
        aria-live="polite"
        className="rounded-xl border border-line bg-surface p-6"
      >
        <p className="text-[14px] font-semibold text-paper">
          {t("savedTitle")}
        </p>
        <Link
          href="/account/saved-addresses"
          className="mt-2 inline-block text-[13px] font-semibold text-accent transition-colors hover:text-accent-hover"
        >
          {t("manageLink")}
        </Link>
      </section>
    );
  }

  const saving = phase.kind === "saving";

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-line bg-surface p-6"
    >
      <h2
        id={headingId}
        className="font-display text-lg font-semibold text-paper"
      >
        {t("title")}
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        {t("description")}
      </p>

      <ul className="mt-5 flex flex-col gap-3">
        {visibleEnds.map((end) => (
          <PromptRow
            key={end.end}
            end={end}
            state={rows[end.end] ?? { checked: true, label: "" }}
            disabled={saving}
            onChange={(patch) => updateRow(end.end, patch)}
          />
        ))}
      </ul>

      {/* Inline, never an `alert()`: on a 409 this is the server's own limit
          wording, which says what to do about it. */}
      {error === null ? null : (
        <p
          role="alert"
          className="mt-4 text-[13px] text-red-700 dark:text-red-400"
        >
          {error}{" "}
          <Link
            href="/account/saved-addresses"
            className="font-semibold text-accent underline-offset-2 hover:underline"
          >
            {t("manageLink")}
          </Link>
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || toSave.length === 0}
          className={SAVE_BUTTON_CLASSES}
        >
          {saving ? t("saving") : t("save")}
        </button>
        <button
          type="button"
          onClick={() => setPhase({ kind: "hidden" })}
          disabled={saving}
          className={SECONDARY_BUTTON_CLASSES}
        >
          {t("notNow")}
        </button>
      </div>
    </section>
  );
}

/** One end of the route: tick, address, contact summary and label. */
function PromptRow({
  end,
  state,
  disabled,
  onChange,
}: {
  end: SaveAddressesPromptEnd;
  state: RowState;
  disabled: boolean;
  onChange: (patch: Partial<RowState>) => void;
}) {
  const t = useTranslations("savedAddresses.prompt");
  const checkboxId = useId();
  const labelId = useId();

  return (
    <li className="rounded-[14px] border border-line bg-ink p-4">
      <div className="flex items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          checked={state.checked}
          disabled={disabled}
          onChange={(event) => onChange({ checked: event.target.checked })}
          // The same native control, tinted with the landing accent, as the
          // add-card dialog's "set as default".
          className="mt-0.5 size-4 shrink-0 accent-accent"
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={checkboxId} className="block cursor-pointer">
            <span className="block text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
              {end.end === "pickup" ? t("pickup") : t("dropoff")}
            </span>
            <span className="mt-1 block text-[14px] font-medium break-words text-paper">
              {end.input.address}
            </span>
          </label>
          <SavedAddressContactSummary contact={end.input} />
        </div>
      </div>

      {/* The label only matters for a row that will be saved. */}
      {state.checked ? (
        <div className="mt-3 flex flex-col gap-1.5 sm:pl-7">
          <label
            htmlFor={labelId}
            className="text-[12px] font-medium text-paper"
          >
            {t("labelHeading")}
          </label>
          <SavedAddressLabelField
            id={labelId}
            value={state.label}
            onChange={(label) => onChange({ label })}
            disabled={disabled}
          />
        </div>
      ) : null}
    </li>
  );
}
