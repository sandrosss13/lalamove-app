"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_LABELS, LOCALES, type AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * The look, kept in step with `THEME_TOGGLE_DEFAULT_CLASSES` in
 * `src/components/theme-toggle.tsx` — the two sit next to each other in every
 * header, so they share a height, a radius, a border and a focus treatment. The
 * only difference is width: this one holds a two-letter label rather than a
 * glyph, so it is `px-3` on `auto` width instead of a `w-9` square.
 *
 * The focus treatment is the project's shadcn convention, copied from
 * `buttonVariants` in `src/components/ui/button.tsx` rather than invented here.
 */
const LANGUAGE_TOGGLE_DEFAULT_CLASSES =
  "grid h-9 shrink-0 place-items-center rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-secondary-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

/** The locale this button switches *to*, given the one currently active. */
function nextLocale(current: AppLocale): AppLocale {
  const index = LOCALES.indexOf(current);
  return LOCALES[(index + 1) % LOCALES.length] ?? current;
}

/**
 * The current query string, as the object shape the wrapped router wants.
 *
 * Read from `window.location` inside the click handler rather than through
 * `useSearchParams()`, and that is not a style preference. This component is
 * mounted in the root layout, so it is in *every* page's tree; `useSearchParams`
 * opts its whole subtree out of static rendering unless a `<Suspense>` boundary
 * catches it, and with this component at the root that would mean bailing out
 * the entire app. (The production build says so in as many words: "useSearchParams()
 * should be wrapped in a suspense boundary".) A click handler only ever runs in
 * the browser, where `window.location` is the same information for free.
 *
 * Repeated keys (`?status=NEW&status=ASSIGNED`, which the admin tables produce)
 * are collected into an array rather than collapsed to the last value, so a
 * multi-select filter survives a language change intact. `undefined` for an
 * empty query, so the destination URL has no stray `?`.
 */
function currentQueryParams(): Record<string, string | string[]> | undefined {
  const searchParams = new URLSearchParams(window.location.search);
  const params: Record<string, string | string[]> = {};

  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    params[key] = values.length > 1 ? values : (values[0] ?? "");
  }

  return Object.keys(params).length > 0 ? params : undefined;
}

/**
 * The app's Georgian/English switch. One implementation, mounted wherever a
 * surface wants one — the same arrangement as `ThemeToggle`, and for the same
 * reason: several surfaces hide the global header in `src/app/[locale]/layout.tsx`
 * and ship their own.
 *
 * Unlike the theme, the locale is part of the URL, so switching is a navigation
 * rather than a class flip. Three things have to survive it:
 *
 * 1. **The path.** `usePathname` from `@/i18n/navigation` returns the pathname
 *    *without* the locale prefix, which is exactly what `router.replace` wants —
 *    so a reader on `/en/orders/42` lands on `/ka/orders/42` rather than being
 *    dropped at the home page, which is what makes the control usable mid-task.
 * 2. **The query string.** Read from `window.location` at click time and
 *    re-attached; a filtered admin table or a `?from=` return path must not be
 *    discarded by a language change. See `currentQueryParams` for why it is not
 *    `useSearchParams`.
 * 3. **Dynamic segments.** Nothing to do: with no `pathnames` mapping
 *    configured in `src/i18n/routing.ts`, `usePathname` returns the resolved
 *    path (`/orders/42`), not a route template, so the segments travel with it.
 *
 * `replace` rather than `push`: the previous language of the same page is not a
 * destination anyone wants the back button to return them to.
 *
 * `next-intl`'s middleware writes the `NEXT_LOCALE` cookie on the navigation
 * this triggers, so the choice survives to the next visit and to any bare URL
 * the visitor arrives on later. Nothing here has to persist anything itself.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const t = useTranslations("common.languageToggle");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();

  // The navigation is a server round trip. Without a transition the button would
  // sit dead for its duration with no indication it was pressed; `isPending`
  // disables it, which also stops a second click queueing another navigation.
  const [isPending, startTransition] = useTransition();

  const target = nextLocale(locale);

  function handleClick() {
    startTransition(() => {
      router.replace(
        { pathname, query: currentQueryParams() },
        { locale: target },
      );
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      // Names the destination, not the current state: the visible label is the
      // language you get by pressing, and the accessible name must agree with it
      // rather than describe the language you are already reading.
      aria-label={t("switchTo", { language: LOCALE_LABELS[target] })}
      lang={target}
      className={cn(LANGUAGE_TOGGLE_DEFAULT_CLASSES, className)}
    >
      {/*
        The short form (`ქარ` / `EN`) keeps the control the same size in both
        languages; the full name is in the accessible label above. `lang` on the
        button tells the browser which face to reach for, so the Georgian label
        renders in Noto Sans Georgian rather than a system fallback.
      */}
      {t(`short.${target}`)}
    </button>
  );
}
