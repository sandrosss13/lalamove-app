/**
 * End to end: the proof of delivery on `/orders/[id]/track` reaches the
 * order's client and nobody else.
 *
 * The unit half (`order-track-page.spec.ts`) pins the rule; this half signs in
 * for real and reads the rendered HTML, which is where a leak would actually
 * be — a signed `delivery-proofs` URL in the RSC payload is readable whether
 * or not anything draws it.
 *
 * **Opt-in, read-only.** It needs two accounts and a completed order with
 * proof on the server under test, which only a seeded local database has, so
 * it is skipped unless all of these are set:
 *
 *   E2E_TRACK_ORDER_ID          a COMPLETED order with a signature on file
 *   E2E_TRACK_CLIENT_EMAIL      that order's client
 *   E2E_TRACK_CLIENT_PASSWORD
 *   E2E_TRACK_OTHER_EMAIL       any other account — e.g. the carrier company
 *   E2E_TRACK_OTHER_PASSWORD    that ran the order
 *
 * It signs in and issues GETs; it writes nothing. Better Auth checks `Origin`
 * against `BETTER_AUTH_URL`, so the sign-in sends `E2E_BASE_URL` as its origin
 * — point that at the same host the server was configured with.
 */

import {
  expect,
  request,
  test,
  type APIRequestContext,
} from "@playwright/test";

const env = {
  orderId: process.env.E2E_TRACK_ORDER_ID,
  clientEmail: process.env.E2E_TRACK_CLIENT_EMAIL,
  clientPassword: process.env.E2E_TRACK_CLIENT_PASSWORD,
  otherEmail: process.env.E2E_TRACK_OTHER_EMAIL,
  otherPassword: process.env.E2E_TRACK_OTHER_PASSWORD,
};

/** What a signed read URL on the proof bucket contains. */
const POD_URL_MARKER = "/object/sign/delivery-proofs/";

async function signedIn(
  baseURL: string,
  email: string,
  password: string,
): Promise<APIRequestContext> {
  const origin = new URL(baseURL).origin;
  const context = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: origin },
  });
  const response = await context.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  expect(response.ok(), `sign-in as ${email}`).toBe(true);
  return context;
}

test.describe("proof of delivery on the tracking page", () => {
  test.skip(
    Object.values(env).some((value) => !value),
    "set the E2E_TRACK_* variables to run against a seeded server",
  );

  test("the client's page carries the signed proof URLs", async ({
    baseURL,
  }) => {
    const client = await signedIn(
      baseURL!,
      env.clientEmail!,
      env.clientPassword!,
    );
    const html = await (
      await client.get(`/en/orders/${env.orderId}/track`)
    ).text();

    expect(html).toContain("Proof of delivery");
    expect(html).toContain(POD_URL_MARKER);
    await client.dispose();
  });

  test("another account gets 'not found' and no proof URL", async ({
    baseURL,
  }) => {
    const other = await signedIn(baseURL!, env.otherEmail!, env.otherPassword!);
    for (const locale of ["en", "ka"]) {
      const html = await (
        await other.get(`/${locale}/orders/${env.orderId}/track`)
      ).text();
      expect(html).not.toContain(POD_URL_MARKER);
      expect(html).not.toContain("proof-of-delivery-heading");
    }
    // And the order page, which never offered proof, offers none either.
    const detail = await (await other.get(`/en/orders/${env.orderId}`)).text();
    expect(detail).not.toContain(POD_URL_MARKER);
    await other.dispose();
  });
});
