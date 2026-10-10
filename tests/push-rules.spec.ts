/**
 * The rules of push delivery, pinned without a server: token shape, whether
 * sending is configured, what an offer push carries, and which tokens Expo's
 * answer says to delete.
 */

import { expect, test } from "@playwright/test";

import {
  buildOfferPushMessage,
  chunk,
  EXPO_PUSH_MAX_MESSAGES_PER_REQUEST,
  EXPO_PUSH_SEND_URL,
  isExpoPushToken,
  parseDevicePlatform,
  resolvePushConfig,
  tokensToPrune,
} from "@/lib/push/rules";

const UNSET = {
  nodeEnv: "production",
  expoPushEnabled: undefined,
  expoAccessToken: undefined,
  expoPushApiUrl: undefined,
};

test.describe("isExpoPushToken", () => {
  test("accepts both forms Expo issues", () => {
    expect(isExpoPushToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(
      true,
    );
    expect(isExpoPushToken("ExpoPushToken[abc-DEF_123]")).toBe(true);
  });

  test("refuses anything else", () => {
    for (const value of [
      "",
      "abc",
      "ExponentPushToken[]",
      "ExponentPushToken[a b]",
      "ExponentPushToken[abc",
      " ExponentPushToken[abc]",
      "ExponentPushToken[abc]\n",
      `ExponentPushToken[${"x".repeat(201)}]`,
      null,
      42,
      ["ExponentPushToken[abc]"],
    ]) {
      expect(isExpoPushToken(value)).toBe(false);
    }
  });
});

test.describe("parseDevicePlatform", () => {
  test("accepts Platform.OS spelling and the enum's", () => {
    expect(parseDevicePlatform("ios")).toBe("IOS");
    expect(parseDevicePlatform("android")).toBe("ANDROID");
    expect(parseDevicePlatform("IOS")).toBe("IOS");
  });

  test("refuses other platforms and non-strings", () => {
    expect(parseDevicePlatform("web")).toBeNull();
    expect(parseDevicePlatform("")).toBeNull();
    expect(parseDevicePlatform(undefined)).toBeNull();
    expect(parseDevicePlatform(1)).toBeNull();
  });
});

test.describe("resolvePushConfig", () => {
  test("is off unless explicitly enabled", () => {
    expect(resolvePushConfig(UNSET)).toEqual({ enabled: false });
    expect(resolvePushConfig({ ...UNSET, expoPushEnabled: "1" })).toEqual({
      enabled: false,
    });
    expect(resolvePushConfig({ ...UNSET, expoPushEnabled: "TRUE" })).toEqual({
      enabled: false,
    });
    // A token alone does not switch sending on.
    expect(resolvePushConfig({ ...UNSET, expoAccessToken: "secret" })).toEqual({
      enabled: false,
    });
  });

  test("enabled, it sends to Expo, with the access token when given", () => {
    expect(resolvePushConfig({ ...UNSET, expoPushEnabled: "true" })).toEqual({
      enabled: true,
      url: EXPO_PUSH_SEND_URL,
      accessToken: null,
    });
    expect(
      resolvePushConfig({
        ...UNSET,
        expoPushEnabled: " true ",
        expoAccessToken: " secret ",
      }),
    ).toEqual({
      enabled: true,
      url: EXPO_PUSH_SEND_URL,
      accessToken: "secret",
    });
  });

  test("the URL override is ignored in production", () => {
    const overridden = {
      ...UNSET,
      expoPushEnabled: "true",
      expoPushApiUrl: "http://127.0.0.1:9/push",
    };

    expect(resolvePushConfig(overridden)).toMatchObject({
      url: EXPO_PUSH_SEND_URL,
    });
    expect(
      resolvePushConfig({ ...overridden, nodeEnv: "development" }),
    ).toMatchObject({ url: "http://127.0.0.1:9/push" });
  });
});

test.describe("buildOfferPushMessage", () => {
  const message = buildOfferPushMessage({
    token: "ExponentPushToken[abc]",
    offerId: "offer_1",
    title: "New load offer",
    body: "Open the app to respond before it expires.",
    ttlSeconds: 27.2,
  });

  test("carries the offer id and nothing else about the load", () => {
    expect(message).toEqual({
      to: "ExponentPushToken[abc]",
      title: "New load offer",
      body: "Open the app to respond before it expires.",
      sound: "default",
      priority: "high",
      ttl: 28,
      data: { type: "LOAD_OFFER", offerId: "offer_1" },
    });
  });

  test("the builder cannot be handed load details", () => {
    // Its whole input is a token, an id, wording and a lifetime: there is no
    // parameter an address, a name or an amount could arrive through.
    expect(buildOfferPushMessage.length).toBe(1);
    expect(Object.keys(message.data).sort()).toEqual(["offerId", "type"]);
  });

  test("ttl is at least one second", () => {
    expect(
      buildOfferPushMessage({
        token: "t",
        offerId: "o",
        title: "",
        body: "",
        ttlSeconds: 0,
      }).ttl,
    ).toBe(1);
  });
});

test.describe("tokensToPrune", () => {
  const sent = ["token_a", "token_b", "token_c"];

  test("prunes exactly the DeviceNotRegistered tickets, by position", () => {
    expect(
      tokensToPrune(sent, {
        data: [
          { status: "ok", id: "1" },
          {
            status: "error",
            message: "gone",
            details: { error: "DeviceNotRegistered" },
          },
          { status: "ok", id: "3" },
        ],
      }),
    ).toEqual(["token_b"]);
  });

  test("other ticket errors are not about the device", () => {
    expect(
      tokensToPrune(sent, {
        data: [
          { status: "error", details: { error: "MessageRateExceeded" } },
          { status: "error", details: { error: "MessageTooBig" } },
          { status: "error", message: "no details" },
        ],
      }),
    ).toEqual([]);
  });

  test("prunes nothing when the answer cannot be paired with the request", () => {
    const dead = { status: "error", details: { error: "DeviceNotRegistered" } };

    expect(tokensToPrune(sent, { data: [dead] })).toEqual([]);
    expect(
      tokensToPrune(sent, { errors: [{ code: "TOO_MANY_REQUESTS" }] }),
    ).toEqual([]);
    expect(tokensToPrune(sent, { data: dead })).toEqual([]);
    expect(tokensToPrune(sent, null)).toEqual([]);
    expect(tokensToPrune(sent, "boom")).toEqual([]);
  });
});

test.describe("chunk", () => {
  test("splits at Expo's 100-message limit, in order", () => {
    const items = Array.from({ length: 250 }, (_, index) => index);
    const chunks = chunk(items, EXPO_PUSH_MAX_MESSAGES_PER_REQUEST);

    expect(chunks.map((part) => part.length)).toEqual([100, 100, 50]);
    expect(chunks.flat()).toEqual(items);
    expect(chunk([], 100)).toEqual([]);
  });
});
