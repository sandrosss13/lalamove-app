/**
 * The smsoffice.ge sender, against a stubbed `fetch` — no SMS is ever sent.
 * Pins the request shape smsoffice.ge expects and that every failure rejects,
 * so a sign-in code is never reported as sent when it was not.
 */

import { expect, test } from "@playwright/test";

import {
  SMSOFFICE_SEND_URL,
  SmsOfficeError,
  createSmsOfficeSender,
  smsOfficeConfigFromEnv,
} from "@/lib/sms/smsoffice";

const CONFIG = { apiKey: "test-key", sender: "Zomo" };
const MESSAGE = { to: "+995555123456", body: "Your code is 123456" };

type Call = { url: string; init: RequestInit };

function stubFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as unknown as typeof fetch;

  return { calls, fetchImpl };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test.describe("smsOfficeConfigFromEnv", () => {
  test("needs both the key and the sender", () => {
    expect(smsOfficeConfigFromEnv({})).toBeNull();
    expect(smsOfficeConfigFromEnv({ SMSOFFICE_API_KEY: "k" })).toBeNull();
    expect(smsOfficeConfigFromEnv({ SMSOFFICE_SENDER: "Zomo" })).toBeNull();
    expect(
      smsOfficeConfigFromEnv({ SMSOFFICE_API_KEY: " ", SMSOFFICE_SENDER: "Zomo" }),
    ).toBeNull();
    expect(
      smsOfficeConfigFromEnv({
        SMSOFFICE_API_KEY: " k ",
        SMSOFFICE_SENDER: " Zomo ",
      }),
    ).toEqual({ apiKey: "k", sender: "Zomo" });
  });
});

test.describe("createSmsOfficeSender", () => {
  test("posts the form smsoffice.ge expects", async () => {
    const { calls, fetchImpl } = stubFetch(() =>
      json({ Success: true, Message: null, Output: null, ErrorCode: 0 }),
    );

    await createSmsOfficeSender(CONFIG, fetchImpl).send(MESSAGE);

    expect(calls).toHaveLength(1);
    const [call] = calls as [Call];
    expect(call.url).toBe(SMSOFFICE_SEND_URL);
    expect(call.init.method).toBe("POST");

    const form = new URLSearchParams(String(call.init.body));
    expect(Object.fromEntries(form)).toEqual({
      key: "test-key",
      destination: "995555123456",
      sender: "Zomo",
      content: "Your code is 123456",
      urgent: "true",
    });
  });

  test("rejects with the ErrorCode when smsoffice.ge refuses", async () => {
    const { fetchImpl } = stubFetch(() =>
      json({ Success: false, Message: "x", Output: null, ErrorCode: 150 }),
    );

    const error = await createSmsOfficeSender(CONFIG, fetchImpl)
      .send(MESSAGE)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SmsOfficeError);
    expect((error as SmsOfficeError).errorCode).toBe(150);
    expect((error as Error).message).toContain("sender is not registered");
    expect((error as Error).message).not.toContain("test-key");
  });

  test("rejects on an HTTP error, a malformed body and a network failure", async () => {
    for (const respond of [
      () => json({ Success: true }, 500),
      () => new Response("<html>oops</html>", { status: 200 }),
      () => json({ ok: true }),
      () => Promise.reject(new TypeError("fetch failed")),
    ]) {
      const { fetchImpl } = stubFetch(respond);

      await expect(
        createSmsOfficeSender(CONFIG, fetchImpl).send(MESSAGE),
      ).rejects.toBeInstanceOf(SmsOfficeError);
    }
  });
});
