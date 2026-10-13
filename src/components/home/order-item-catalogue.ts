"use client";

import { useEffect, useState } from "react";

import {
  ITEM_CATALOGUE_ERROR_MESSAGE,
  parseCatalogueLocale,
  shapeCatalogueEntry,
  toLoadLine,
  searchCatalogue,
  type CatalogueItem,
  type CatalogueLocale,
} from "@/lib/item-catalogue";

/*
 * The browser half of the item catalogue: the shared fetch and the hook. The
 * shape, search and adapters live in `src/lib/item-catalogue.ts` so the route
 * can import them without pulling React into a server bundle. They are
 * re-exported here so the picker has one import site.
 */

export {
  ITEM_CATALOGUE_ERROR_MESSAGE,
  parseCatalogueLocale,
  shapeCatalogueEntry,
  toLoadLine,
  searchCatalogue,
};
export type {
  CatalogueLocale,
  CatalogueItem,
  CatalogueRow,
} from "@/lib/item-catalogue";

/**
 * One request per locale, shared by every section that asks. Cleared on
 * failure so a later mount retries. Keyed by locale because the label differs.
 */
const catalogueRequests = new Map<CatalogueLocale, Promise<CatalogueItem[]>>();

function loadCatalogue(locale: CatalogueLocale): Promise<CatalogueItem[]> {
  let request = catalogueRequests.get(locale);
  if (!request) {
    request = fetch(`/api/item-catalogue?locale=${locale}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Item catalogue request failed: ${response.status}`);
        }
        return response.json() as Promise<CatalogueItem[]>;
      })
      .catch((cause: unknown) => {
        catalogueRequests.delete(locale);
        throw cause;
      });
    catalogueRequests.set(locale, request);
  }
  return request;
}

/** The active catalogue in `locale`, fetched once per page load. */
export function useItemCatalogue(locale: CatalogueLocale): {
  items: CatalogueItem[];
  loading: boolean;
  error: string | null;
} {
  const [state, setState] = useState<{
    locale: CatalogueLocale;
    items: CatalogueItem[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    // The request is shared, so it is never aborted; the flag drops the result.
    let active = true;
    loadCatalogue(locale)
      .then((items) => {
        if (active) setState({ locale, items, error: null });
      })
      .catch(() => {
        if (active) {
          setState({ locale, items: [], error: ITEM_CATALOGUE_ERROR_MESSAGE });
        }
      });
    return () => {
      active = false;
    };
  }, [locale]);

  const current = state?.locale === locale ? state : null;
  return {
    items: current?.items ?? [],
    loading: current === null,
    error: current?.error ?? null,
  };
}
