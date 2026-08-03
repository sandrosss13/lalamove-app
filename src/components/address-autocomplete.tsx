"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A single autocomplete suggestion. Mirrors `AddressSuggestion` from
 * `@/lib/geo`, duplicated here so this client component never imports the
 * server-only geo module (which reads env vars at module scope).
 */
type AddressSuggestion = {
  displayName: string;
};

type AddressAutocompleteProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
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
 * `/api/geocode/suggest`. A drop-in replacement for a plain controlled address
 * field: parent state stays in sync on every keystroke, and selecting a
 * suggestion fills the input with its display name.
 */
export function AddressAutocomplete({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const listboxId = useId();

  // Clean up any pending timers / in-flight request on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurRef.current) clearTimeout(blurRef.current);
      abortRef.current?.abort();
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

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    onChange(next);
    scheduleFetch(next);
  }

  function handleSelect(suggestion: AddressSuggestion) {
    if (blurRef.current) {
      clearTimeout(blurRef.current);
    }
    onChange(suggestion.displayName);
    setSuggestions([]);
    setOpen(false);
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
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <div className="relative">
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
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded border bg-background shadow"
          >
            {suggestions.map((suggestion, index) => (
              <li
                // The list is replaced wholesale on each fetch and never
                // reordered or edited in place, so an index-derived key is
                // stable for as long as these nodes live.
                key={`${suggestion.displayName}-${index}`}
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
  );
}
