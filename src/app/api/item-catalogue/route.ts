import { NextResponse } from "next/server";

import {
  parseCatalogueLocale,
  shapeCatalogueEntry,
} from "@/lib/item-catalogue";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/item-catalogue?locale=en|ka — the active item catalogue the goods
 * booking form searches and browses, labelled in one locale.
 *
 * Public and unauthenticated: reference data, like `/api/vehicle-types`.
 *
 * **The locale comes from the query string, never from
 * `src/i18n/request-locale.ts`.** That helper reads the `NEXT_LOCALE` cookie or
 * the Referer, which a shared cache does not key on; a CDN holding one response
 * per path would serve one visitor's language to everyone else. With the locale
 * in the URL, each language is its own cache entry, which is the only reason
 * the `Cache-Control` below is safe. A missing or unknown value is English.
 *
 * Admin edits to the catalogue take up to five minutes to show
 * (`s-maxage=300`), and a stale copy may be served for up to an hour while it
 * revalidates.
 *
 * Inactive entries are never selected: deactivating is how an item leaves the
 * form, and it must not reach a client that has the page open.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const locale = parseCatalogueLocale(
    new URL(request.url).searchParams.get("locale"),
  );

  const rows = await prisma.itemCatalogEntry.findMany({
    where: { active: true },
    orderBy: [{ group: "asc" }, { sortOrder: "asc" }],
    // Explicit select: ids, timestamps and `active` are internal.
    select: {
      code: true,
      group: true,
      labelEn: true,
      labelKa: true,
      synonymsEn: true,
      synonymsKa: true,
      weightKg: true,
      lengthM: true,
      widthM: true,
      heightM: true,
      stackable: true,
      needsTwoPeople: true,
      requiredBody: true,
      handlingTags: true,
      cargoCategory: true,
    },
  });

  return NextResponse.json(
    rows.map((row) => shapeCatalogueEntry(row, locale)),
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
