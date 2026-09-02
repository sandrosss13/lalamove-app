"use client";

import { useEffect, useId, useRef, useState } from "react";
import { APIProvider, Map, Marker, useMap } from "@vis.gl/react-google-maps";

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
 * The structured breakdown of a selected place, as returned by
 * `/api/geocode/details`. Mirrors `PlaceDetails` from `@/lib/geo`, duplicated
 * for the same reason as the types above.
 */
type PlaceDetails = {
  location: LatLng;
  formattedAddress: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

/** The editable, user-facing subset of `PlaceDetails` — the sub-form's fields. */
type AddressParts = Pick<
  PlaceDetails,
  "street" | "city" | "state" | "postalCode" | "country"
>;

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
   * keeps working untouched. Editing the structured sub-form does not fire this
   * — those edits are never re-geocoded, so the last known coordinates remain
   * the best available answer.
   */
  onLocationChange?: (location: LatLng | null) => void;
  placeholder?: string;
  required?: boolean;
};

/** Minimum trimmed length before we fetch suggestions (matches the server). */
const MIN_QUERY_LENGTH = 3;
/** Debounce window after the last keystroke before firing a lookup. */
const DEBOUNCE_MS = 300;
/** Delay closing the dropdown on blur so a suggestion click registers first. */
const BLUR_CLOSE_DELAY_MS = 150;
/** Street-level zoom for the preview — a picked address is a single building. */
const MAP_PREVIEW_ZOOM = 16;

/**
 * The structured sub-form's fields, in render order. Driven by data rather than
 * five hand-written blocks so the label, `autoComplete` token, and layout of
 * each field stay in one place. `autoComplete` uses the standard address tokens
 * so browsers can fill the breakdown the same way they would any address form.
 */
const ADDRESS_PART_FIELDS: {
  key: keyof AddressParts;
  label: string;
  autoComplete: string;
  /** Street, city and country read as full lines; state/postcode pair up. */
  wide: boolean;
}[] = [
  { key: "street", label: "Street", autoComplete: "address-line1", wide: true },
  { key: "city", label: "City", autoComplete: "address-level2", wide: true },
  { key: "state", label: "State", autoComplete: "address-level1", wide: false },
  {
    key: "postalCode",
    label: "Postal code",
    autoComplete: "postal-code",
    wide: false,
  },
  {
    key: "country",
    label: "Country",
    autoComplete: "country-name",
    wide: true,
  },
];

/**
 * Flatten the structured parts back into the single address string the parent
 * form — and everything downstream of it (pricing, the orders API, the
 * dashboards) — works in: `"street, city, state postalCode, country"`.
 *
 * State and postal code share one segment because they read as a single unit on
 * an address label. Every part is trimmed and empty ones drop out entirely, so a
 * place missing (say) a postcode never leaves a stray comma or double space.
 */
function composeAddress(parts: AddressParts): string {
  const regionSegment = [parts.state, parts.postalCode]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" ");

  return [
    parts.street.trim(),
    parts.city.trim(),
    regionSegment,
    parts.country.trim(),
  ]
    .filter((segment) => segment.length > 0)
    .join(", ");
}

/**
 * Keeps the preview centred on the currently selected place.
 *
 * Renders nothing — it only drives the imperative `google.maps.Map` handle from
 * `useMap()`, which is why it must live inside `<Map>`. Recentring this way
 * rather than passing a controlled `center` leaves the camera uncontrolled, so
 * the user can still pan and zoom the preview between selections.
 */
function MapCameraController({ center }: { center: LatLng }) {
  const map = useMap();

  useEffect(() => {
    if (!map) {
      return;
    }

    map.setCenter(center);
    map.setZoom(MAP_PREVIEW_ZOOM);
  }, [map, center]);

  return null;
}

/**
 * Small map preview pinning the selected address.
 *
 * Unlike the order tracking map, a missing API key renders nothing at all
 * rather than an explanatory box: the map is a confirmation aid here, and the
 * address input and structured fields must keep working — and keep looking
 * uncluttered — on a deployment with no Maps key configured. No hooks run
 * before that early return, so the split into an outer/inner component the
 * tracking map needs isn't required here.
 */
function AddressMapPreview({ location }: { location: LatLng }) {
  // Inlined at build time by Next because of the NEXT_PUBLIC_ prefix; must be
  // referenced as a full literal expression for that substitution to happen.
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return null;
  }

  return (
    <div className="h-48 w-full overflow-hidden rounded border">
      <APIProvider apiKey={apiKey}>
        <Map
          // `default*` props leave the camera uncontrolled; recentring on a new
          // selection is `MapCameraController`'s job.
          defaultCenter={location}
          defaultZoom={MAP_PREVIEW_ZOOM}
          gestureHandling="cooperative"
          disableDefaultUI
          zoomControl
          style={{ width: "100%", height: "100%" }}
        >
          <Marker position={location} title="Selected address" />
          <MapCameraController center={location} />
        </Map>
      </APIProvider>
    </div>
  );
}

/**
 * Address input with a live, debounced suggestions dropdown backed by
 * `/api/geocode/suggest`, plus a structured breakdown of whatever the user
 * picks.
 *
 * Selecting a suggestion resolves it through `/api/geocode/details` and reveals
 * editable Street / City / State / Postal code / Country fields alongside a map
 * preview of the place. Those fields are recomposed into one address string on
 * every edit, so this stays a drop-in replacement for a plain controlled address
 * field: the parent still owns a single string and is notified through the same
 * `onChange(value)` on every keystroke and every structured edit.
 *
 * The map only moves when a suggestion is selected — keystrokes go to the
 * server-side suggestions proxy, never to a client-side geocoder.
 */
export function AddressAutocomplete({
  id,
  label,
  value,
  onChange,
  onLocationChange,
  placeholder,
  required,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  // Null until a suggestion resolves: the sub-form and preview only exist once
  // there is a real place behind the free text in the input.
  const [parts, setParts] = useState<AddressParts | null>(null);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [detailsPending, setDetailsPending] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const detailsAbortRef = useRef<AbortController | null>(null);

  const listboxId = useId();
  const partsId = useId();

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
   * Resolve a picked suggestion to its structured breakdown and coordinates,
   * then reveal the sub-form and preview.
   *
   * A failed lookup (offline, missing server key, stale place id) leaves the
   * field exactly as a plain autocomplete would: the display name stays in the
   * input and no sub-form appears, rather than showing five blank boxes the
   * user never asked for.
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

      const nextParts: AddressParts = {
        street: details.street,
        city: details.city,
        state: details.state,
        postalCode: details.postalCode,
        country: details.country,
      };
      setParts(nextParts);
      setLocation(details.location);
      onLocationChange?.(details.location);

      // Keep the input equal to the composition of the fields below it, so
      // editing one of them reads as editing the address shown above. If the
      // place carried no usable components at all, fall back to Google's own
      // rendering rather than blanking a field the user just filled.
      const composed = composeAddress(nextParts);
      onChange(composed || details.formattedAddress || suggestion.displayName);
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

    // Typing over the input abandons the selected place: the breakdown and the
    // map pin no longer describe what the field says.
    detailsAbortRef.current?.abort();
    setParts(null);
    setLocation(null);
    onLocationChange?.(null);
    setDetailsPending(false);
  }

  function handleSelect(suggestion: AddressSuggestion) {
    if (blurRef.current) {
      clearTimeout(blurRef.current);
    }
    onChange(suggestion.displayName);
    setSuggestions([]);
    setOpen(false);
    void loadDetails(suggestion);
  }

  /** Apply one structured edit and re-publish the recomposed address string. */
  function handlePartChange(key: keyof AddressParts, next: string) {
    if (!parts) {
      return;
    }

    const updated = { ...parts, [key]: next };
    setParts(updated);
    onChange(composeAddress(updated));
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
    // A plain <div> rather than a wrapping <label>: the structured sub-form has
    // labels of its own, and labels cannot nest.
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
            // how the structured breakdown and map preview below already
            // expand. Capped so a long result list can't take over the page.
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
        <p className="opacity-70">Loading address details…</p>
      ) : null}

      {parts ? (
        <div className="flex flex-col gap-3 rounded border p-3">
          <div className="grid grid-cols-2 gap-3">
            {ADDRESS_PART_FIELDS.map((field) => (
              <label
                key={field.key}
                htmlFor={`${partsId}-${field.key}`}
                className={`flex flex-col gap-1 ${field.wide ? "col-span-2" : ""}`}
              >
                <span className="opacity-70">{field.label}</span>
                <input
                  id={`${partsId}-${field.key}`}
                  type="text"
                  // Never `required`: Google omits components it has no data
                  // for, so a blank box here is a normal state the user may
                  // choose to fill in or leave alone.
                  value={parts[field.key]}
                  onChange={(event) =>
                    handlePartChange(field.key, event.target.value)
                  }
                  autoComplete={field.autoComplete}
                  className="w-full rounded border px-3 py-2"
                />
              </label>
            ))}
          </div>

          {location ? <AddressMapPreview location={location} /> : null}
        </div>
      ) : null}
    </div>
  );
}
