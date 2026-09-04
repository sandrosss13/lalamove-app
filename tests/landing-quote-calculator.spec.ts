/**
 * The public quote calculator at `/#price-a-load`: the only money surface a
 * visitor reaches without an account, and the one place the currency fix can be
 * regression-tested end to end against the real pricing endpoint.
 *
 * The flow stops at the quote. `POST /api/pricing/estimate` computes and
 * returns without writing a row, which is what makes this safe to run against
 * any environment, production included.
 *
 * What this file deliberately does not cover:
 *
 * - **Booking.** The calculator's only next step is "Sign up to book this
 *   load", and the tests stop at the link. `DATABASE_URL` points at
 *   production, a booked order lands on the live driver load board, and the
 *   client has no cancel — so signing up, saving a card, and placing an order
 *   all need a test database before they can be exercised.
 * - **The tier picker.** Priority/Regular/Pooling live on the authenticated
 *   booking form, which needs a signed-in client. Their arithmetic is covered
 *   without a browser in `tests/service-level-pricing.spec.ts`.
 *
 * The whole file shares one page and one quote. Each quote costs three
 * LocationIQ lookups against a six-per-minute budget
 * (`src/app/api/pricing/estimate/route.ts`), so a quote per test would spend
 * the endpoint's rate limit on repetition rather than on coverage.
 */

import { expect, test, type Page } from "@playwright/test";

/** The fields of a successful estimate this spec reads back. */
type EstimatePayload = {
  distanceKm: number;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  helperFee: number;
  price: number;
};

/**
 * A short central-Tbilisi hop, on the calculator's default cargo type. Short
 * because a two-kilometre route on the cheapest eligible vehicle is the case
 * that reaches the vehicle's minimum fare — but nothing below asserts that it
 * does; whether the floor applied is read out of the quote itself.
 */
const PICKUP_ADDRESS = "Rustaveli Ave 12, Tbilisi";
const DROPOFF_ADDRESS = "Aghmashenebeli Ave 88, Tbilisi";

/**
 * A price as the client sees it: the lari sign, `en-GB` grouping, and exactly
 * two decimals. Anchored at both ends, so a stray `$` or a third decimal fails
 * rather than matching a prefix.
 */
const GEL_PRICE = /^₾\d{1,3}(,\d{3})*\.\d{2}$/;

/**
 * The same `en-GB`, two-decimal settings the surface formats through
 * (`src/components/landing/landing-format.ts`). Used rather than `toFixed(2)`
 * so a four-figure fare is compared with its group separator instead of
 * against `1234.56`.
 */
const GEL_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * The component treats the fare as floored when the components fall short of
 * the total by more than half a cent, so that floating-point dust does not read
 * as a minimum fare (`landing-quote-calculator.tsx:281-287`). The same margin
 * is used here, for the same reason.
 */
const FLOOR_MARGIN_GEL = 0.005;

test.describe.serial("Landing quote calculator", () => {
  let page: Page;
  let quote: EstimatePayload;

  test.beforeAll(async ({ browser }, testInfo) => {
    // A page created off the worker's browser rather than the per-test `page`
    // fixture, so all four tests read one quote. It needs the project's
    // `baseURL` handed to it explicitly, which the fixture would have applied.
    page = await browser.newPage({ baseURL: testInfo.project.use.baseURL });

    await page.goto("/#price-a-load");

    const section = page.locator("#price-a-load");
    await section.getByLabel("Pickup").fill(PICKUP_ADDRESS);
    await section.getByLabel("Dropoff").fill(DROPOFF_ADDRESS);

    const calculate = section.getByRole("button", { name: "Calculate price" });
    // The button stays disabled until the vehicle taxonomy has been fetched —
    // there is no quote to give before one is known to price against.
    await expect(calculate).toBeEnabled({ timeout: 30_000 });

    const estimateResponse = page.waitForResponse((response) =>
      response.url().includes("/api/pricing/estimate"),
    );
    await calculate.click();
    const response = await estimateResponse;

    // Read as text first so a rejection can be reported in the server's own
    // words: a 429 from the shared rate limit and a 422 from an address the
    // geocoder could not place are very different problems to be told about.
    const body = await response.text();
    expect(response.status(), `estimate rejected: ${body}`).toBe(200);
    quote = JSON.parse(body) as EstimatePayload;
  });

  test.afterAll(async () => {
    await page.close();
  });

  /** The result panel, which is also the live region the quote is announced in. */
  function quotePanel() {
    return page.locator('#price-a-load [aria-live="polite"]');
  }

  /** Every money figure in the panel: the headline estimate and each breakdown line. */
  function quotedPrices() {
    return quotePanel().locator("dd").filter({ hasText: /^₾/ });
  }

  test("quotes a fare for a pickup and a dropoff", async () => {
    const panel = quotePanel();

    await expect(panel).toContainText("Your estimate");
    // The headline figure is the first definition in the panel, under the
    // "Your estimate" term. It is checked against the quote the server actually
    // returned, so a panel showing a stale or invented number fails here.
    await expect(panel.locator("dd").first()).toHaveText(
      `₾${GEL_FORMAT.format(quote.price)}`,
    );

    // The distance is quoted alongside the fare, which is what makes the figure
    // accountable rather than arbitrary.
    await expect(panel).toContainText(`${quote.distanceKm.toFixed(1)} km`);
  });

  test("prices the load in lari, never in dollars", async () => {
    const panel = quotePanel();

    await expect(panel).toContainText("₾");
    // The regression this guards: every client-facing figure printed `$` for a
    // fare denominated in GEL. A dollar sign anywhere in the result panel —
    // headline, breakdown line or note — is that bug returning.
    await expect(panel).not.toContainText("$");
  });

  test("prints every figure to two decimal places", async () => {
    const prices = quotedPrices();

    // At the default crew size of one there is no helper line, so the panel
    // carries the headline and the transportation cost. Asserted as "at least
    // one" rather than as an exact count, so adding a breakdown line does not
    // fail a test about how figures are formatted.
    expect(await prices.count()).toBeGreaterThan(0);

    for (const price of await prices.allInnerTexts()) {
      expect(price).toMatch(GEL_PRICE);
    }
  });

  test("notes the minimum fare exactly when the quote was floored", async () => {
    const componentsTotal =
      quote.baseFare + quote.distanceFare + quote.timeFare + quote.helperFee;
    const floored = componentsTotal < quote.price - FLOOR_MARGIN_GEL;

    const note = quotePanel().getByText("Minimum fare applied");

    // Asserted against the arithmetic in the quote rather than against a route
    // assumed to floor: a rate change that lifts this hop above the minimum
    // should not turn this test red, it should flip which branch it takes.
    if (floored) {
      await expect(note).toBeVisible();
    } else {
      await expect(note).toHaveCount(0);
    }
  });

  test("offers signing up as the only way on from a quote", async () => {
    // The calculator estimates and stops. Nothing on this surface creates an
    // order, which is the property that keeps this whole spec safe to run
    // against production.
    await expect(
      page.locator("#price-a-load").getByRole("link", {
        name: "Sign up to book this load",
      }),
    ).toBeVisible();
  });
});
