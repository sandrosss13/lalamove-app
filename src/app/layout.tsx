/**
 * A pass-through root layout, and a deliberately empty one.
 *
 * Every real route lives under `src/app/[locale]`, whose layout is what renders
 * `<html>` and `<body>` — it has to be, because the `lang` attribute and the
 * message provider both need a locale, and only that segment has one.
 *
 * So why does this file exist at all? Next needs *a* root layout for anything
 * rendered outside the `[locale]` segment, and there is exactly one such thing:
 * the global `not-found.tsx` beside this file, which answers a URL whose first
 * segment is not a locale. Without a root layout, that page has nowhere to
 * render, and the build fails at the very last step with a bare
 * `Cannot find module for page: /_error` — a message that names neither the
 * cause nor this file.
 *
 * It returns `children` unwrapped on purpose. Emitting `<html>`/`<body>` here
 * as well would nest a second document inside the one `[locale]/layout.tsx`
 * renders; `src/app/not-found.tsx` supplies its own instead, since nothing
 * above it does.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
