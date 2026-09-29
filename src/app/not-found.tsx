import { LOCALE_LABELS, LOCALES, withLocalePrefix } from "@/i18n/routing";

import "./globals.css";

/**
 * The 404 for a URL that never reached a locale.
 *
 * Almost nothing lands here: the middleware redirects an unprefixed path into
 * the reader's language, so a miss inside the app is answered by the
 * `not-found` under `src/app/[locale]` with the full site chrome around it.
 * What arrives here is the residue — a request the middleware's `matcher`
 * skipped, or a first segment that is neither a locale nor anything else.
 *
 * Which is exactly why it cannot use `useTranslations`: there is no locale to
 * look a message up in, and guessing one would mean answering an English
 * speaker in Georgian half the time. It says it in both languages instead, and
 * offers a way into each. That is also why it renders its own `<html>` and
 * `<body>` — the root layout beside it is a pass-through, so this page is the
 * whole document.
 *
 * `lang` is left off the `<html>` element rather than set to a guess: the page
 * genuinely has two languages in it, and claiming one would make a screen
 * reader pronounce the other with the wrong voice.
 */
export default function GlobalNotFound() {
  return (
    <html suppressHydrationWarning>
      <body>
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 p-8">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium opacity-50">404</p>
            <h1 className="text-2xl font-bold" lang="ka">
              გვერდი ვერ მოიძებნა
            </h1>
            <h2 className="text-2xl font-bold" lang="en">
              Page not found
            </h2>
          </div>

          <nav className="flex flex-col gap-2">
            <p className="text-sm opacity-70" lang="ka">
              აირჩიეთ ენა და დაბრუნდით მთავარ გვერდზე:
            </p>
            <p className="text-sm opacity-70" lang="en">
              Pick a language to head back to the home page:
            </p>

            {/*
              Plain `<a>` and a hand-built href, not the `Link` from
              `@/i18n/navigation`: that component resolves the active locale, and
              on this page there isn't one. A full document navigation is also
              what we want — it lets the middleware set the locale cookie on the
              way through, so the choice made here sticks.
            */}
            <div className="mt-2 flex gap-3">
              {LOCALES.map((locale) => (
                <a
                  key={locale}
                  href={withLocalePrefix(locale, "/")}
                  lang={locale}
                  className="rounded border px-3 py-2 text-sm font-medium hover:opacity-70"
                >
                  {LOCALE_LABELS[locale]}
                </a>
              ))}
            </div>
          </nav>
        </main>
      </body>
    </html>
  );
}
