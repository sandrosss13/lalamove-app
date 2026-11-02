"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

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

/**
 * An address the host already knows — a client's saved address, say — offered
 * above the search suggestions. Picking one fills the field without any lookup:
 * `location` stands in for what `/api/geocode/details` would have resolved.
 */
export type AddressAutocompleteSavedItem = {
  /** Stable identity, handed back through `onSavedItemPicked`. */
  id: string;
  /** Short name shown first ("Home", "Office"). */
  label: string;
  /** The address text the field is set to, verbatim. */
  address: string;
  /** Its coordinates, or `null` when the host has none for it. */
  location: LatLng | null;
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
  /**
   * Per-part class overrides, for hosts that dress the field in their own
   * design language (the v4 landing booking card). Each key *replaces* that
   * part's default classes rather than merging with them, so a host gets
   * exactly the look it asks for. Omitted keys keep the defaults, so existing
   * callers render exactly as before.
   */
  classNames?: AddressAutocompleteClassNames;
  /**
   * Float the suggestions list over whatever follows the input instead of
   * pushing it down. For hosts that lay fields out side by side (a grid row),
   * where an in-flow list would stretch the whole row. Defaults to `false`,
   * the in-flow behaviour the stacked booking form relies on.
   */
  overlaySuggestions?: boolean;
  /**
   * Render the "loading address details" notice and the map preview once a
   * suggestion is picked. Defaults to `true`. With it off and no
   * `onLocationChange` listener, the details lookup is skipped altogether: its
   * coordinates would have nowhere to go.
   */
  showMapPreview?: boolean;
  /**
   * Known addresses to offer as their own group above the search suggestions,
   * already in the order to show them. The field shows them on focus — when
   * empty as well, which is the point — narrowed by the typed text against
   * label and address and capped at `MAX_SAVED_ITEMS`.
   *
   * Picking one sets the address through `onChange` and its coordinates through
   * `onLocationChange`, exactly as a resolved suggestion would, then calls
   * `onSavedItemPicked`. It does NOT call `onPlaceSelected`: that announces a
   * place the host knows nothing more about, and a host typically reacts by
   * asking for the rest — a saved item is one it already has the rest of.
   *
   * Omitted or empty, the field behaves exactly as it always has.
   */
  savedItems?: readonly AddressAutocompleteSavedItem[];
  /** Called with the picked saved item's `id`, after the field is updated. */
  onSavedItemPicked?: (id: string) => void;
  /**
   * The saved group's visible heading, which also names the group for
   * assistive tech. Required in practice whenever `savedItems` is non-empty.
   */
  savedItemsLabel?: string;
  /**
   * Optional trailing content for the saved group's header — a "Manage" link.
   * Kept as a node so this component stays unaware of routes and locales.
   */
  savedItemsAction?: ReactNode;
};

/** See `AddressAutocompleteProps.classNames`. */
export type AddressAutocompleteClassNames = {
  /** The outermost wrapper (field, pending notice, map preview). */
  root?: string;
  /** The `<label>` wrapping the label text and the input. */
  label?: string;
  /** The label text itself. */
  labelText?: string;
  /** The text input. */
  input?: string;
  /** The suggestions `<ul role="listbox">`. */
  listbox?: string;
  /** Each suggestion's button. */
  option?: string;
};

const DEFAULT_CLASS_NAMES = {
  root: "flex flex-col gap-2 text-sm",
  label: "flex flex-col gap-1",
  labelText: "",
  input: "w-full rounded border px-3 py-2",
  listbox: "max-h-60 overflow-y-auto rounded border bg-background shadow",
  option: "block w-full px-3 py-2 text-left hover:opacity-70",
} satisfies Required<AddressAutocompleteClassNames>;

/** Minimum trimmed length before we fetch suggestions (matches the server). */
const MIN_QUERY_LENGTH = 3;
/** Debounce window after the last keystroke before firing a lookup. */
const DEBOUNCE_MS = 300;
/** Delay closing the dropdown on blur so a suggestion click registers first. */
const BLUR_CLOSE_DELAY_MS = 150;
/**
 * At most this many saved items show at once. The group sits above the search
 * results, so an uncapped list would push them out of the capped dropdown.
 */
const MAX_SAVED_ITEMS = 5;

/**
 * The saved items to show for the field's current text: all of them (capped)
 * while it is blank, otherwise those whose label or address contains the text,
 * ignoring case and surrounding whitespace. The host's order is kept — it is
 * the order it chose (most recently used first, for saved addresses).
 */
function matchingSavedItems(
  items: readonly AddressAutocompleteSavedItem[],
  text: string,
): AddressAutocompleteSavedItem[] {
  const query = text.trim().toLocaleLowerCase();
  const matches =
    query === ""
      ? items
      : items.filter(
          (item) =>
            item.label.toLocaleLowerCase().includes(query) ||
            item.address.toLocaleLowerCase().includes(query),
        );
  return matches.slice(0, MAX_SAVED_ITEMS);
}
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
  classNames,
  overlaySuggestions = false,
  showMapPreview = true,
  savedItems,
  onSavedItemPicked,
  savedItemsLabel,
  savedItemsAction,
}: AddressAutocompleteProps) {
  const t = useTranslations("common.addressAutocomplete");
  const classes = { ...DEFAULT_CLASS_NAMES, ...classNames };
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [detailsPending, setDetailsPending] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const detailsAbortRef = useRef<AbortController | null>(null);

  const listboxId = useId();
  const savedHeadingId = useId();

  const visibleSavedItems = matchingSavedItems(savedItems ?? [], value);
  // `open` is "the client is engaged with this field" (focused, typing, not
  // dismissed); whether anything is actually drawn also needs something to
  // draw. Splitting the two is what lets the saved group show on focus of an
  // empty field, while a field with neither group still renders — and announces
  // through `aria-expanded` — exactly what it did before saved items existed.
  const listVisible =
    open && (visibleSavedItems.length > 0 || suggestions.length > 0);

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
      // No `setOpen(false)`: with no suggestions the list draws nothing anyway
      // (see `listVisible`), and leaving `open` alone keeps the saved group up
      // while a short query is still narrowing it.
      setSuggestions([]);
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
          // Results reopen a dismissed list, as they always did; no results
          // leave `open` alone, since an empty suggestions group draws nothing
          // and the saved group may still have matches to show.
          if (next.length > 0) {
            setOpen(true);
          }
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
    // Typing is engagement: if the saved group has matches for the new text,
    // show them now rather than after the suggest debounce (and even after an
    // Escape, as a fresh result list would).
    if (matchingSavedItems(savedItems ?? [], next).length > 0) {
      setOpen(true);
    }

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
    // Nobody would see or hear the coordinates, so don't spend a request on
    // the rate-limited details endpoint for them.
    if (showMapPreview || onLocationChange) {
      void loadDetails(suggestion);
    }
  }

  /**
   * Fill the field from a saved item. Mirrors `handleSelect` up to the point
   * where that one goes looking for coordinates: a saved item already carries
   * them, so they go straight to `onLocationChange` — the same call a resolved
   * details lookup makes — and nothing is fetched.
   */
  function handleSavedSelect(item: AddressAutocompleteSavedItem) {
    if (blurRef.current) {
      clearTimeout(blurRef.current);
    }
    // A pending suggest lookup (debounced or in flight) would otherwise land
    // after this and reopen the list over the address just chosen; a pending
    // details lookup for an earlier pick would overwrite these coordinates.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    abortRef.current?.abort();
    detailsAbortRef.current?.abort();
    setDetailsPending(false);

    onChange(item.address);
    onLocationChange?.(item.location);
    setSuggestions([]);
    setOpen(false);
    onSavedItemPicked?.(item.id);
  }

  function handleBlur() {
    // Delay so a mousedown on a suggestion resolves before the list closes.
    blurRef.current = setTimeout(() => setOpen(false), BLUR_CLOSE_DELAY_MS);
  }

  function handleFocus() {
    if (suggestions.length > 0 || visibleSavedItems.length > 0) {
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
    <div className={classes.root}>
      <label htmlFor={id} className={classes.label}>
        {/* A span with no classes lays out exactly like the bare text node it
            replaced (both are a single flex item), so default callers are
            unchanged. */}
        <span className={classes.labelText || undefined}>{label}</span>
        {/* Groups the input with its suggestions list. Only `relative` in
            overlay mode, where it anchors the floating list; by default the
            list sits in normal flow (see its comment below). */}
        <div className={overlaySuggestions ? "relative" : undefined}>
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
            aria-expanded={listVisible}
            aria-controls={listboxId}
            aria-autocomplete="list"
            className={classes.input}
          />
          {listVisible ? (
            // In normal flow rather than an absolute overlay: two of these
            // fields stack a short gap apart in the booking form, and an
            // overlaid list buried the next field's label and input entirely.
            // Opening the list now pushes what follows down the page, matching
            // how the map preview below already expands. Capped so a long
            // result list can't take over the page.
            <ul
              id={listboxId}
              role="listbox"
              // Overlay mode (opt-in, for side-by-side layouts) floats the list
              // instead: z-50 keeps it above the content that follows.
              className={cn(
                classes.listbox,
                overlaySuggestions
                  ? "absolute inset-x-0 top-full z-50 mt-1"
                  : "mt-1",
              )}
            >
              {visibleSavedItems.length > 0 ? (
                // One listbox, two groups: the saved items sit in a labelled
                // `role="group"` so a screen reader announces them as their
                // own set, and the search results that follow stay plain
                // options exactly as before. The wrapping item is
                // presentational — the group is what the listbox owns.
                <li role="presentation">
                  <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2 text-xs font-semibold opacity-70">
                    <span id={savedHeadingId}>{savedItemsLabel}</span>
                    {savedItemsAction ? (
                      // Same mousedown guard as the options: without it the
                      // input's blur could start closing the list first.
                      <span onMouseDown={(event) => event.preventDefault()}>
                        {savedItemsAction}
                      </span>
                    ) : null}
                  </div>
                  <ul role="group" aria-labelledby={savedHeadingId}>
                    {visibleSavedItems.map((item) => (
                      <li key={item.id} role="option" aria-selected={false}>
                        <button
                          type="button"
                          // See the suggestion buttons below.
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleSavedSelect(item)}
                          className={classes.option}
                        >
                          <span className="block font-medium">
                            {item.label}
                          </span>
                          {/* Skipped when the label IS the address (the
                              server's default for an unlabelled save), so
                              the item does not read the same line twice. */}
                          {item.label.trim() !== item.address.trim() ? (
                            <span className="block truncate text-xs opacity-70">
                              {item.address}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {suggestions.length > 0 ? (
                    <div role="separator" className="my-1 border-t" />
                  ) : null}
                </li>
              ) : null}
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
                    className={classes.option}
                  >
                    {suggestion.displayName}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </label>

      {showMapPreview && detailsPending ? (
        <p className="opacity-70">{t("loadingAddressDetails")}</p>
      ) : null}
    </div>
  );
}
