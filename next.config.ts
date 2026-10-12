import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * Points the plugin at the request config. The path is passed explicitly rather
 * than relying on the convention (`./i18n/request.ts` relative to the project
 * or `src` root) so that moving the file shows up as a failure here instead of
 * as a silent fallback to an empty message set at runtime.
 */
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /**
   * `pdfkit` and `fontkit` (which the waybill renderer also uses directly, to
   * check glyph coverage) are loaded by Node at runtime instead of bundled.
   * pdfkit ships data files and fontkit binary table decoders that webpack can
   * break. Leaving both to `require` keeps the waybill PDF route on the
   * packages as they were published.
   */
  serverExternalPackages: ["pdfkit", "fontkit"],

  /**
   * The waybill PDF route reads its TTF files with `fs` at request time
   * (`src/lib/waybill/render-pdf.ts`), and file tracing cannot see a path built
   * at runtime. Without this line a standalone or serverless build ships the
   * route without its fonts, and every download fails with ENOENT.
   */
  outputFileTracingIncludes: {
    "/api/orders/[id]/waybill/pdf": ["./src/lib/waybill/fonts/**"],
  },
};

export default withNextIntl(nextConfig);
