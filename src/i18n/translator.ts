/**
 * The smallest shape of a `next-intl` translator that a label helper needs:
 * a root-namespace `t` (from `useTranslations()` / `getTranslations()` with no
 * namespace) called with a full dotted key.
 *
 * Structural rather than imported from `next-intl`, so plain data modules
 * (`@/lib/cargo`, `@/components/orders-format`, …) can take a translator from a
 * server component, a client component or an API route alike without caring
 * which of the three produced it.
 */
export type Translator = (
  key: string,
  values?: Record<string, string | number>,
) => string;
