// Reads through Prisma, so it must never end up in a browser bundle. Fails the
// build loudly if a client component ever imports it.
import "server-only";

import type { ContentLocale } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Looks up one translated string by its `(namespace, key, locale)` identity —
 * the same composite the admin UI edits under `/admin/content/translations`.
 *
 * `ContentLocale` is the generated Prisma enum and is exactly `"KA" | "EN"`;
 * it is used here rather than the literal union so a future locale added to the
 * schema surfaces as a type error at the call sites instead of silently
 * narrowing.
 *
 * Returns `null` for a key that has no row in that locale rather than throwing
 * or falling back to the other locale: callers decide what a missing string
 * means (their own hard-coded default, or the other locale), and a silent
 * cross-locale fallback would hide untranslated content instead of exposing it.
 *
 * Deliberately uncached — one indexed unique lookup per call. Nothing consumes
 * this yet (wiring the public site up to it is a separate, much larger effort),
 * so adding a cache now would be tuning a call pattern that does not exist.
 */
export async function getTranslation(
  namespace: string,
  key: string,
  locale: ContentLocale,
): Promise<string | null> {
  const entry = await prisma.translationEntry.findUnique({
    where: { namespace_key_locale: { namespace, key, locale } },
    select: { value: true },
  });

  return entry?.value ?? null;
}
