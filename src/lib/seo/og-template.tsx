import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import {
  ZOMO_BRAND_COLOURS,
  ZOMO_LOCKUP_GEOMETRY,
  ZOMO_SYMBOL_GEOMETRY,
  ZOMO_WORDMARK_GEOMETRY,
} from "@/components/brand/zomo-logo";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/i18n/routing";

/**
 * Shared renderer for the Open Graph / Twitter card images.
 *
 * Satori (behind `next/og`) ships no fonts with Georgian glyphs, so without the
 * committed Noto Sans Georgian face every Georgian headline would render as
 * empty boxes. IBM Plex Sans (the site's own face) is listed first; Satori
 * falls back per glyph to the next loaded font, so Latin text stays in Plex
 * and Georgian lands in Noto. Both are OFL — licences sit beside the files.
 *
 * The copy is hardcoded here rather than read from the message catalogs on
 * purpose: these strings are written for a 1200×630 card (short, keyword-led)
 * and are not UI text.
 */

/** Recommended OG size; also what X/Twitter's summary_large_image crops to. */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const OG_IMAGE_CONTENT_TYPE = "image/png";

export type OgImageVariant = "client" | "driver";

type OgCopy = { headline: string; subline: string; host: string };

const OG_COPY: Record<OgImageVariant, Record<AppLocale, OgCopy>> = {
  client: {
    ka: {
      headline: "ტვირთის გადაზიდვა თბილისში",
      subline: "ფურგონი ან სატვირთო რამდენიმე წუთში — მთელ საქართველოში",
      host: "zomo.ge",
    },
    en: {
      headline: "Cargo delivery in Tbilisi",
      subline: "Book a van or truck in minutes — across Georgia",
      host: "zomo.ge",
    },
  },
  driver: {
    ka: {
      headline: "მძღოლის ვაკანსია",
      subline: "იმუშავე ზომოსთან — შენი მანქანით, შენი გრაფიკით",
      host: "driver.zomo.ge",
    },
    en: {
      headline: "Drive with zomo",
      subline: "Driver jobs in Tbilisi — your vehicle, your schedule",
      host: "driver.zomo.ge",
    },
  },
};

/**
 * Static alt text per variant. Next only accepts `alt` as a static export of
 * the image file (a per-locale alt would need `generateImageMetadata`, which
 * moves the image to `/opengraph-image/<id>`), so it carries both languages.
 */
export const OG_IMAGE_ALT: Record<OgImageVariant, string> = {
  client: "zomo — ტვირთის გადაზიდვა თბილისში · Cargo delivery in Tbilisi",
  driver: "zomo — მძღოლის ვაკანსია · Driver jobs in Tbilisi",
};

const FONT_DIR = join(process.cwd(), "src/assets/fonts");

const FONT_FILES = [
  { name: "IBM Plex Sans", file: "IBMPlexSans-Bold.ttf", weight: 700 },
  { name: "IBM Plex Sans", file: "IBMPlexSans-Regular.ttf", weight: 400 },
  {
    name: "Noto Sans Georgian",
    file: "NotoSansGeorgian-Bold.ttf",
    weight: 700,
  },
  {
    name: "Noto Sans Georgian",
    file: "NotoSansGeorgian-Regular.ttf",
    weight: 400,
  },
] as const;

type LoadedFont = {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
};

// Memoised per server instance: the files never change at runtime, and the
// four reads would otherwise repeat on every image request.
let fontsPromise: Promise<LoadedFont[]> | undefined;

function loadFonts(): Promise<LoadedFont[]> {
  fontsPromise ??= Promise.all(
    FONT_FILES.map(async ({ name, file, weight }) => ({
      name,
      data: await readFile(join(FONT_DIR, file)),
      weight,
      style: "normal" as const,
    })),
  ).catch((error: unknown) => {
    // Do not cache a failure — the next request gets a fresh attempt.
    fontsPromise = undefined;
    throw error;
  });
  return fontsPromise;
}

const COLOURS = {
  background: "#15140f",
  accent: ZOMO_BRAND_COLOURS.orange,
  headline: ZOMO_BRAND_COLOURS.offwhite,
  subline: "#b9b3a6",
} as const;

const LOCKUP_HEIGHT = 64;
const WATERMARK_SIZE = 420;

/** Dark lockup (bright-orange symbol, off-white wordmark) as Satori SVG. */
function Lockup() {
  const { width, height, wordmarkTransform } = ZOMO_LOCKUP_GEOMETRY;
  const symbolColour = ZOMO_BRAND_COLOURS.bright;
  const wordmarkColour = ZOMO_BRAND_COLOURS.offwhite;
  const S = ZOMO_SYMBOL_GEOMETRY;
  const W = ZOMO_WORDMARK_GEOMETRY;

  return (
    <svg
      width={(LOCKUP_HEIGHT * width) / height}
      height={LOCKUP_HEIGHT}
      viewBox={`0 0 ${width} ${height}`}
    >
      <path
        d={S.routePath}
        fill="none"
        stroke={symbolColour}
        strokeWidth={S.routeStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle {...S.startDot} fill={symbolColour} />
      <circle {...S.endDot} fill={symbolColour} />
      <g transform={wordmarkTransform}>
        <g
          fill="none"
          stroke={wordmarkColour}
          strokeWidth={W.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={W.zPath} />
          <circle {...W.firstO} />
          <path d={W.mPath} />
          <circle {...W.secondO} />
        </g>
        <circle {...W.zDot} fill={wordmarkColour} />
      </g>
    </svg>
  );
}

/** Oversized, low-opacity "route z" bleeding off the right edge. */
function SymbolWatermark() {
  const S = ZOMO_SYMBOL_GEOMETRY;
  const colour = COLOURS.accent;

  return (
    <svg
      width={WATERMARK_SIZE}
      height={WATERMARK_SIZE}
      viewBox={`0 0 ${S.size} ${S.size}`}
      style={{ position: "absolute", right: -60, bottom: -40, opacity: 0.22 }}
    >
      <path
        d={S.routePath}
        fill="none"
        stroke={colour}
        strokeWidth={S.routeStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle {...S.startDot} fill={colour} />
      <circle {...S.endDot} fill={colour} />
    </svg>
  );
}

/** Narrows the `[locale]` route param; unknown values get the default copy. */
export function ogLocale(value: string): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
}

export async function renderOgImage(
  variant: OgImageVariant,
  locale: AppLocale,
): Promise<ImageResponse> {
  const copy = OG_COPY[variant][locale];
  const fonts = await loadFonts();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        padding: "72px 80px",
        backgroundColor: COLOURS.background,
        fontFamily: '"IBM Plex Sans", "Noto Sans Georgian"',
      }}
    >
      <SymbolWatermark />
      <Lockup />
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 860 }}>
        <div
          style={{
            width: 96,
            height: 10,
            borderRadius: 5,
            backgroundColor: COLOURS.accent,
            marginBottom: 36,
          }}
        />
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.12,
            color: COLOURS.headline,
          }}
        >
          {copy.headline}
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 34,
            fontWeight: 400,
            lineHeight: 1.35,
            color: COLOURS.subline,
          }}
        >
          {copy.subline}
        </div>
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: COLOURS.accent,
        }}
      >
        {copy.host}
      </div>
    </div>,
    { ...OG_IMAGE_SIZE, fonts },
  );
}
