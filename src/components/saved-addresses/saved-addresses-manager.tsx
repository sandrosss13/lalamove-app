"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";

import type { SavedAddressDto } from "@/lib/saved-addresses/contract";

import { SavedAddressContactSummary } from "./contact-summary";
import { EditSavedAddressDialog } from "./edit-saved-address-dialog";
import { readErrorMessage } from "./saved-address-format";

/**
 * The list on `/account/saved-addresses`: every saved address with its label
 * and contact summary, an Edit that opens `EditSavedAddressDialog`, and a
 * two-step Remove.
 *
 * Owns its own copy of the list, read from `GET /api/saved-addresses` on mount
 * and patched in place from each mutation's response — the API returns the
 * updated row on PATCH and nothing to re-read on DELETE, so there is no
 * `router.refresh()` round trip as on the wallet page.
 *
 * Colour rule as on the wallet: landing token utilities, with the destructive
 * remove control and inline errors on the red palette pair (`700` light,
 * `400` dark — see `saved-cards-panel.tsx` for why the two halves differ).
 */

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; addresses: SavedAddressDto[] };

/** A failure attached to the row whose control caused it. */
type RowError = { id: string; message: string };

const SECTION_HEADING_CLASSES =
  "text-[11px] font-semibold tracking-[0.1em] text-muted uppercase";

const ROW_BUTTON_CLASSES =
  "rounded-lg px-2 py-1.5 text-[13px] font-semibold text-paper transition-colors hover:text-accent disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-60";

const REMOVE_BUTTON_BASE_CLASSES =
  "rounded-lg px-2 py-1.5 text-[13px] font-semibold transition-colors disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-60";

const REMOVE_UNARMED_CLASSES =
  "text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300";

const REMOVE_ARMED_CLASSES =
  "bg-red-700 px-3 text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500";

/** `GET /api/saved-addresses`'s rows, or `null` when the body is not one. */
function readAddresses(body: unknown): SavedAddressDto[] | null {
  if (
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as { addresses?: unknown }).addresses)
  ) {
    return (body as { addresses: SavedAddressDto[] }).addresses;
  }
  return null;
}

export function SavedAddressesManager({
  accountType,
}: {
  /** A BUSINESS client is not asked for a driver comment. */
  accountType: "INDIVIDUAL" | "BUSINESS";
}) {
  const t = useTranslations("savedAddresses.manager");
  const tShared = useTranslations("common.shared");
  const headingId = useId();
  const noteId = `${headingId}-remove-note`;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [editing, setEditing] = useState<SavedAddressDto | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<RowError | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/saved-addresses");
        if (cancelled) return;

        if (!response.ok) {
          setState({
            kind: "error",
            message: await readErrorMessage(response, t("loadFailed")),
          });
          return;
        }

        const addresses = readAddresses(
          await response.json().catch(() => null),
        );
        if (cancelled) return;
        setState(
          addresses === null
            ? { kind: "error", message: t("loadFailed") }
            : { kind: "ready", addresses },
        );
      } catch {
        if (!cancelled) setState({ kind: "error", message: t("networkError") });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [t]);

  /** Swaps an edited row in place; called by the dialog on a 200. */
  function handleSaved(updated: SavedAddressDto) {
    setState((current) =>
      current.kind === "ready"
        ? {
            kind: "ready",
            addresses: current.addresses.map((row) =>
              row.id === updated.id ? updated : row,
            ),
          }
        : current,
    );
  }

  async function handleRemove(id: string) {
    // Removal cannot be undone, so the first click only arms it — an in-page
    // confirm in the app's own language rather than a browser `confirm()`.
    if (armedId !== id) {
      setRowError(null);
      setArmedId(id);
      return;
    }

    setRowError(null);
    setRemovingId(id);

    try {
      const response = await fetch(
        `/api/saved-addresses/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );

      // A 404 means it is already gone (removed in another tab): the outcome
      // the client asked for, so the row leaves the list either way.
      if (!response.ok && response.status !== 404) {
        setRowError({
          id,
          message: await readErrorMessage(response, t("removeFailed")),
        });
        return;
      }

      setState((current) =>
        current.kind === "ready"
          ? {
              kind: "ready",
              addresses: current.addresses.filter((row) => row.id !== id),
            }
          : current,
      );
    } catch {
      setRowError({ id, message: t("networkError") });
    } finally {
      // Disarmed either way: after a failure the client should have to mean
      // it again.
      setArmedId(null);
      setRemovingId(null);
    }
  }

  if (state.kind === "loading") {
    return (
      <p aria-live="polite" className="text-[13px] text-muted">
        {t("loading")}
      </p>
    );
  }

  if (state.kind === "error") {
    return (
      <p role="alert" className="text-[13px] text-red-700 dark:text-red-400">
        {state.message}
      </p>
    );
  }

  const { addresses } = state;
  const busy = removingId !== null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className={SECTION_HEADING_CLASSES}>
        {t("heading")}
      </h2>

      {addresses.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line bg-surface p-8 text-center">
          <p className="text-[14px] font-medium text-paper">
            {t("emptyTitle")}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {t("emptyBody")}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {addresses.map((row) => {
            const armed = armedId === row.id;
            const removing = removingId === row.id;
            const error = rowError?.id === row.id ? rowError.message : null;
            // An empty label defaults to the address server-side; showing the
            // address twice would add nothing.
            const showAddress = row.label.trim() !== row.address.trim();

            return (
              <li
                key={row.id}
                className="rounded-[14px] border border-line bg-ink px-5 py-[18px]"
              >
                <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="text-[15px] font-semibold break-words text-paper">
                      {row.label}
                    </p>
                    {showAddress ? (
                      <p className="mt-0.5 text-[13px] break-words text-paper/80">
                        {row.address}
                      </p>
                    ) : null}
                    <SavedAddressContactSummary contact={row} />
                  </div>

                  <div className="ml-auto flex items-center gap-1">
                    {armed ? null : (
                      <button
                        type="button"
                        onClick={() => {
                          setArmedId(null);
                          setRowError(null);
                          setEditing(row);
                        }}
                        disabled={busy}
                        aria-label={t("editAria", { label: row.label })}
                        className={ROW_BUTTON_CLASSES}
                      >
                        {tShared("edit")}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleRemove(row.id)}
                      disabled={busy}
                      aria-label={
                        armed
                          ? t("confirmRemovalAria", { label: row.label })
                          : t("removeAria", { label: row.label })
                      }
                      aria-describedby={
                        armed ? `${noteId}-${row.id}` : undefined
                      }
                      className={`${REMOVE_BUTTON_BASE_CLASSES} ${
                        armed ? REMOVE_ARMED_CLASSES : REMOVE_UNARMED_CLASSES
                      }`}
                    >
                      {removing
                        ? t("removing")
                        : armed
                          ? t("confirmRemoval")
                          : tShared("remove")}
                    </button>

                    {armed && !removing ? (
                      <button
                        type="button"
                        onClick={() => setArmedId(null)}
                        className={ROW_BUTTON_CLASSES}
                      >
                        {tShared("cancel")}
                      </button>
                    ) : null}
                  </div>
                </div>

                {armed ? (
                  <p
                    id={`${noteId}-${row.id}`}
                    className="mt-2.5 text-[12px] leading-relaxed text-muted"
                  >
                    {t("armedNote")}
                  </p>
                ) : null}

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

      <EditSavedAddressDialog
        address={editing}
        accountType={accountType}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={handleSaved}
      />
    </section>
  );
}
