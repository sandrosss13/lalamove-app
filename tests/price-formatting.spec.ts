/**
 * How a price is drawn, rather than what it comes to.
 *
 * The lari sign (U+20BE) is not in IBM Plex, so every ₾ on the site renders in
 * the system fallback at a wider advance than the digits beside it — 25.2px
 * against 20.4px at 34px. That is a known, documented and accepted state
 * (`src/app/layout.tsx:22-35`); it is not asserted as correct here, and it is
 * not asserted as broken.
 *
 * What is asserted is the property that makes it acceptable: because every
 * money string goes through a `formatGel` helper, every price carries the same
 * sign at the same width, so price columns still align with each other. The one
 * test that pins the *unaccepted* state — the sign matching a digit's advance —
 * is marked `fixme` at the foot of this file and explains itself there.
 *
 * The estimate response is stubbed. Nothing about glyph metrics depends on a
 * real fare, and a stub keeps this spec off the endpoint's six-per-minute rate
 * limit, out of the LocationIQ budget, and deterministic about which figures
 * are on screen.
 *
 * What this file deliberately does not cover:
 *
 * - **The authenticated surfaces.** `/orders`, the booking form's breakdown and
 *   the driver hub each print prices through their own `formatGel`, and the
 *   same alignment property should hold on all of them. Reaching any of them
 *   means signing in, and creating an account writes to a production database —
 *   so those need a test database before they can be asserted.
 */

import { expect, test, type Page } from "@playwright/test";

/**
 * A fixed estimate, standing in for `POST /api/pricing/estimate`.
 *
 * The figures are internally consistent — the four components sum to the total,
 * so no minimum-fare note appears — and deliberately four-figure, so the
 * headline carries a group separator and the sign is measured next to a `1`
 * rather than only next to smaller numbers. The helper fee is non-zero
 * specifically so the breakdown renders its second money line: without it the
 * panel has no column of two prices to compare, and the alignment assertion
 * would have nothing to say.
 *
 * Only the fields the calculator reads are stubbed; the endpoint's route
 * geometry and per-tier prices are for the authenticated booking form.
 */
const STUB_ESTIMATE = {
  distanceKm: 34.2,
  baseFare: 90,
  distanceFare: 800.56,
  timeFare: 304,
  helperFee: 40,
  price: 1234.56,
};

/** A price as the client sees it: lari sign, `en-GB` grouping, two decimals. */
const GEL_PRICE = /^₾\d{1,3}(,\d{3})*\.\d{2}$/;

/**
 * How far two sign widths may differ and still be the same glyph in the same
 * face. Two faces differ by whole pixels here — the fallback sign is 4.8px wider
 * than a mono cell at 34px — so this only has to absorb sub-pixel noise from
 * measuring a fractional layout box.
 */
const WIDTH_TOLERANCE_PX = 0.01;

/**
 * One price on screen, measured: its text, the type it is set in, and the
 * advance width of its leading lari sign.
 *
 * The weight is captured alongside the size because both scale a glyph: the
 * sign comes from the system fallback rather than from IBM Plex, and that face
 * draws its 600 heavier — and wider — than its 400. Prices are therefore
 * comparable within a size and weight, which is exactly the grain alignment
 * happens at.
 */
type PriceGlyphMetric = {
  text: string;
  fontSizePx: number;
  fontWeight: string;
  symbolWidthPx: number;
};

test.describe.serial("Price formatting", () => {
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    page = await browser.newPage({ baseURL: testInfo.project.use.baseURL });

    // Registered before the first navigation, so the calculator's submit is
    // answered from here and never reaches the pricing endpoint.
    await page.route("**/api/pricing/estimate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(STUB_ESTIMATE),
      }),
    );

    await page.goto("/#price-a-load");

    const section = page.locator("#price-a-load");
    await section.getByLabel("Pickup").fill("Rustaveli Ave 12, Tbilisi");
    await section.getByLabel("Dropoff").fill("Aghmashenebeli Ave 88, Tbilisi");
    // Two people, so the request the stub answers is one a helper fee is a
    // plausible reply to.
    //
    // Clicked on the label rather than checked on the radio: the radios are
    // `sr-only`, so the 1px input sits underneath the label a user actually
    // presses, and aiming at the input fails the hit-target check. The label is
    // the control here in every sense that matters.
    // The `has:` locator is rooted at the page rather than at the section
    // because it is re-queried relative to each candidate label: one carrying
    // the section's own selector would go looking for `#price-a-load` inside a
    // label and match nothing.
    const crewSize = { name: /^2 people/ } as const;
    await section
      .locator("label")
      .filter({ has: page.getByRole("radio", crewSize) })
      .click();
    await expect(section.getByRole("radio", crewSize)).toBeChecked();

    const calculate = section.getByRole("button", { name: "Calculate price" });
    await expect(calculate).toBeEnabled({ timeout: 30_000 });
    await calculate.click();

    // The headline figure is the panel's first definition; waiting on it is
    // what tells us the quote has rendered and there is something to measure.
    await expect(quotePanel().locator("dd").first()).toHaveText("₾1,234.56");

    // Metrics taken before the webfonts settle would measure the fallback face
    // for the digits too, which is the very difference under test.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
  });

  test.afterAll(async () => {
    await page.close();
  });

  /** The result panel: the live region the quote is announced in. */
  function quotePanel() {
    return page.locator('#price-a-load [aria-live="polite"]');
  }

  /**
   * Measure the leading character of every money figure in the panel.
   *
   * A `Range` over the first character rather than a canvas measurement,
   * because the question is what the browser actually laid out for this node in
   * this element's resolved font stack — which is precisely what a canvas
   * measurement, taken against a font string reconstructed by hand, would not
   * answer.
   */
  async function measurePriceGlyphs(): Promise<PriceGlyphMetric[]> {
    return quotePanel()
      .locator("dd")
      .evaluateAll((cells) => {
        const measured: PriceGlyphMetric[] = [];

        for (const cell of cells) {
          // Each price is rendered from a single `formatGel` expression, so a
          // money cell is one text node. Cells that are not (and the distance
          // and vehicle cells, which carry no sign) are skipped.
          const textNode = cell.firstChild;
          if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
            continue;
          }

          const text = textNode.textContent ?? "";
          if (!text.startsWith("₾")) {
            continue;
          }

          const range = document.createRange();
          range.setStart(textNode, 0);
          range.setEnd(textNode, 1);

          const style = getComputedStyle(cell);
          measured.push({
            text,
            fontSizePx: Number.parseFloat(style.fontSize),
            fontWeight: style.fontWeight,
            symbolWidthPx: range.getBoundingClientRect().width,
          });
        }

        return measured;
      });
  }

  test("prints every price with the same sign and two decimals", async () => {
    const metrics = await measurePriceGlyphs();

    expect(metrics.length).toBeGreaterThanOrEqual(2);

    for (const metric of metrics) {
      expect(metric.text).toMatch(GEL_PRICE);
    }
  });

  test("renders the lari sign at one width down a price column", async () => {
    const metrics = await measurePriceGlyphs();

    // Grouped by the type the price is set in, because that is the grain the
    // alignment claim is made at: two figures stacked in a column share a size
    // and a weight, and what has to hold is that their signs occupy the same
    // advance so the digits after them line up. Comparing the headline against
    // a breakdown line would only measure that 34px is larger than 13px.
    const columns = new Map<string, PriceGlyphMetric[]>();
    for (const metric of metrics) {
      const key = `${metric.fontSizePx}px/${metric.fontWeight}`;
      columns.set(key, [...(columns.get(key) ?? []), metric]);
    }

    // Without a column of at least two prices there is nothing to align, and
    // every assertion below would pass vacuously.
    const measuredColumns = [...columns.values()].filter(
      (column) => column.length >= 2,
    );
    expect(measuredColumns.length).toBeGreaterThan(0);

    for (const column of measuredColumns) {
      const widths = column.map((metric) => metric.symbolWidthPx);
      expect(
        Math.max(...widths) - Math.min(...widths),
        `signs differ in width across ${column.map((metric) => metric.text).join(", ")}`,
      ).toBeLessThan(WIDTH_TOLERANCE_PX);
    }
  });

  /**
   * Fails today, by design, and is marked so rather than left to fail silently.
   *
   * IBM Plex Mono carries no lari glyph, so the sign is drawn by the system
   * fallback: measured on this headline it comes to 24.6px against a mono cell
   * — every digit — of 19.4px. `src/app/layout.tsx` records the same gap at
   * 25.2px against 20.4px and records it as accepted: it is cosmetic, every
   * price is affected equally, and the real fix is loading a face that has the
   * glyph, which is a design decision rather than a config change.
   *
   * This test is that decision, written where the suite can see it rather than
   * only in a markdown file. The day a lari-carrying face is loaded, dropping
   * the `fixme` is the one-line change that records it.
   */
  test.fixme("renders the lari sign at the same advance width as a digit", async () => {
    const glyphs = await quotePanel()
      .locator("dd")
      .first()
      .evaluate((cell: HTMLElement) => {
        const textNode = cell.firstChild;
        if (!textNode) {
          throw new Error("The estimate figure has no text to measure.");
        }

        // Characters 0 and 1 of `₾1,234.56`: the sign, then the digit it has
        // to line up with.
        const advanceWidth = (offset: number) => {
          const range = document.createRange();
          range.setStart(textNode, offset);
          range.setEnd(textNode, offset + 1);
          return range.getBoundingClientRect().width;
        };

        return { symbolPx: advanceWidth(0), digitPx: advanceWidth(1) };
      });

    // One decimal place: the two are more than 5px apart today, so this is
    // nowhere near a rounding question.
    expect(glyphs.symbolPx).toBeCloseTo(glyphs.digitPx, 1);
  });
});
