"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/** A single map coordinate. Mirrors `LatLng` from `@/lib/geo`, duplicated here
 * so this client component never imports the server-only geo module. */
type LatLng = {
  lat: number;
  lng: number;
};

/**
 * A single autocomplete suggestion. Mirrors `AddressSuggestion` from
 * `@/lib/geo`, duplicated here so this client component never imports the
 * server-only geo module (which reads env vars at module scope).
 */
type AddressSuggestion = {
  displayName: string;
  placeId: string;
};

/**
 * The slice of a `/api/geocode/details` response this component actually reads.
 *
 * The endpoint returns more than this — a formatted address and the place's
 * structured components — but none of it is wanted here: the field keeps the
 * suggestion the user picked, and nothing rewrites that string after the fact.
 * Narrowed rather than mirroring `PlaceDetails` from `@/lib/geo` in full, so the
 * type states exactly what a details response has to carry for this component to
 * work. Declared locally for the same reason as the types above: `@/lib/geo` is
 * server-only and reads env vars at module scope.
 */
type PlaceDetails = {
  location: LatLng;
};

type AddressAutocompleteProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * Notified whenever the resolved coordinates behind the field change: the
   * place's location once a suggestion resolves, and `null` as soon as the user
   * types over the input and abandons that place.
   *
   * Optional, so every existing caller that only cares about the address string
   * keeps working untouched.
   */
  onLocationChange?: (location: LatLng | null) => void;
  /**
   * Called synchronously the instant a suggestion is picked, with that
   * suggestion's own display text.
   *
   * Deliberately separate from `onLocationChange`, which cannot stand in for
   * it: that one also fires on every keystroke (with `null`), and its only
   * non-null call sits behind `/api/geocode/details` — a request this component
   * lets fail in silence in three places, so a place can land in the input
   * without it ever arriving. A caller reacting to the *selection itself*
   * rather than to resolved coordinates has to hear about it here, or it hears
   * about it on every character typed, or not at all.
   *
   * The label is the suggestion as Google rendered it, which is also exactly
   * what the input is set to in the same tick — the details lookup that follows
   * resolves coordinates only and never rewrites the address, so this label and
   * the value the parent owns stay in agreement.
   *
   * Optional, so every existing caller keeps working untouched.
   */
  onPlaceSelected?: (label: string) => void;
  placeholder?: string;
  required?: boolean;
};

/** Minimum trimmed length before we fetch suggestions (matches the server). */
const MIN_QUERY_LENGTH = 3;
/** Debounce window after the last keystroke before firing a lookup. */
const DEBOUNCE_MS = 300;
/** Delay closing the dropdown on blur so a suggestion click registers first. */
const BLUR_CLOSE_DELAY_MS = 150;
/**
 * Address input with a live, debounced suggestions dropdown backed by
 * `/api/geocode/suggest`.
 *
 * The address the parent owns is always plain text: what the user typed, or the
 * suggestion they picked, verbatim. Selecting one also resolves it through
 * `/api/geocode/details`, but only to learn its coordinates — those feed
 * `onLocationChange`, and never the address string. That keeps
 * this a drop-in replacement for a plain controlled address field: the parent
 * owns a single string, notified through `onChange(value)`.
 */
export function AddressAutocomplete({
  id,
  label,
  value,
  onChange,
  onLocationChange,
  onPlaceSelected,
  placeholder,
  required,
}: AddressAutocompleteProps) {
  const t = useTranslations("common.addressAutocomplete");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [detailsPending, setDetailsPending] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const detailsAbortRef = useRef<AbortController | null>(null);

  const listboxId = useId();

  // Clean up any pending timers / in-flight requests on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurRef.current) clearTimeout(blurRef.current);
      abortRef.current?.abort();
      detailsAbortRef.current?.abort();
    };
  }, []);

  /** Debounced fetch: cancels any prior timer and in-flight request first. */
  function scheduleFetch(query: string) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim().length < MIN_QUERY_LENGTH) {
      abortRef.current?.abort();
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      // Cancel a slow/late in-flight fetch so its stale results can't clobber
      // this newer query.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        try {
          const response = await fetch(
            `/api/geocode/suggest?q=${encodeURIComponent(query)}`,
            {
              signal: controller.signal,
            },
          );
          if (!response.ok) {
            return;
          }

          const payload = (await response.json()) as {
            suggestions?: AddressSuggestion[];
          };
          const next = payload.suggestions ?? [];
          setSuggestions(next);
          setOpen(next.length > 0);
        } catch {
          // Aborted (superseded query) or network/parse error — leave the
          // current suggestions untouched and stay quiet.
        }
      })();
    }, DEBOUNCE_MS);
  }

  /**
   * Resolve a picked suggestion to its coordinates, then reveal the preview.
   *
   * Nothing in here touches `onChange`: the address was already settled by
   * `handleSelect`, synchronously and correctly, before this request went out.
   * That is what makes the failure path (offline, missing server key, stale
   * place id) harmless — it leaves the field exactly as a plain autocomplete
   * would, the picked display name still in the input, only without a preview.
   */
  async function loadDetails(suggestion: AddressSuggestion): Promise<void> {
    detailsAbortRef.current?.abort();
    const controller = new AbortController();
    detailsAbortRef.current = controller;
    setDetailsPending(true);

    try {
      const response = await fetch(
        `/api/geocode/details?placeId=${encodeURIComponent(suggestion.placeId)}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        details?: PlaceDetails | null;
      };
      const details = payload.details;
      // A superseded request can still resolve after a newer selection has
      // started; drop its result rather than overwriting the newer place.
      if (!details || controller.signal.aborted) {
        return;
      }

      onLocationChange?.(details.location);
    } catch {
      // Aborted (superseded selection) or network/parse error — keep the
      // display name that was already applied and stay quiet.
    } finally {
      // Only the newest request owns the pending flag; an aborted one clearing
      // it would hide the indicator for the selection that superseded it.
      if (!controller.signal.aborted) {
        setDetailsPending(false);
      }
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    onChange(next);
    scheduleFetch(next);

    // Typing over the input abandons the selected place: its coordinates no
    // longer describe what the field says.
    detailsAbortRef.current?.abort();
    onLocationChange?.(null);
    setDetailsPending(false);
  }

  function handleSelect(suggestion: AddressSuggestion) {
    if (blurRef.current) {
      clearTimeout(blurRef.current);
    }
    // The suggestion's own text is the address, verbatim and immediately —
    // `loadDetails` below is only after coordinates and will never revise this.
    onChange(suggestion.displayName);
    // Announced here, before the details lookup is even started: this is the one
    // moment a selection is a certainty. `loadDetails` below may resolve, be
    // superseded, or fail quietly, and none of that should decide whether the
    // parent learns that the user picked an address.
    onPlaceSelected?.(suggestion.displayName);
    setSuggestions([]);
    setOpen(false);
    void loadDetails(suggestion);
  }

  function handleBlur() {
    // Delay so a mousedown on a suggestion resolves before the list closes.
    blurRef.current = setTimeout(() => setOpen(false), BLUR_CLOSE_DELAY_MS);
  }

  function handleFocus() {
    if (suggestions.length > 0) {
      setOpen(true);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    // A plain <div> rather than a wrapping <label>: the pending notice and the
    // map preview are siblings of the labelled input, not part of what names it,
    // and folding an interactive map into a label's click target would let a
    // stray pan or zoom focus the input instead.
    <div className="flex flex-col gap-2 text-sm">
      <label htmlFor={id} className="flex flex-col gap-1">
        {label}
        {/* Groups the input with its suggestions list. Deliberately not
            `relative`: the list sits in normal flow (see its comment below), so
            there is nothing here left to anchor. */}
        <div>
          <input
            id={id}
            type="text"
            required={required}
            value={value}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            className="w-full rounded border px-3 py-2"
          />
          {open && suggestions.length > 0 ? (
            // In normal flow rather than an absolute overlay: two of these
            // fields stack a short gap apart in the booking form, and an
            // overlaid list buried the next field's label and input entirely.
            // Opening the list now pushes what follows down the page, matching
            // how the map preview below already expands. Capped so a long
            // result list can't take over the page.
            <ul
              id={listboxId}
              role="listbox"
              className="mt-1 max-h-60 overflow-y-auto rounded border bg-background shadow"
            >
              {suggestions.map((suggestion, index) => (
                <li
                  // The list is replaced wholesale on each fetch and never
                  // reordered or edited in place, so an index-derived key is
                  // stable for as long as these nodes live.
                  key={`${suggestion.placeId}-${index}`}
                  role="option"
                  aria-selected={false}
                >
                  <button
                    type="button"
                    // mousedown fires before the input's blur, so the selection
                    // registers even though blur would otherwise close the list.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(suggestion)}
                    className="block w-full px-3 py-2 text-left hover:opacity-70"
                  >
                    {suggestion.displayName}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </label>

      {detailsPending ? (
        <p className="opacity-70">{t("loadingAddressDetails")}</p>
      ) : null}

    </div>
  );
}
