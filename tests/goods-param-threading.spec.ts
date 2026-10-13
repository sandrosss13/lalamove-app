/**
 * The `?goods=` shortcut's trip through sign-up / sign-in
 * (`src/lib/goods-param-threading.ts`). Pure: no page, no server.
 *
 * The property under test is the security one: only an exact shortcut code is
 * ever forwarded, and nothing a visitor types can turn a post-auth hop into a
 * link off the app. Every hostile value below must come out as "no shortcut",
 * never as a cleaned-up or partially-kept one.
 */

import { expect, test } from "@playwright/test";

import {
  appendGoodsParam,
  GOODS_PARAM,
  parseGoodsParam,
  postAuthDestination,
  withGoodsParam,
} from "@/lib/goods-param-threading";
import { GOODS_SHORTCUTS } from "@/lib/goods-shortcuts";

/**
 * What an attacker might put in `?goods=`, as the framework hands it over —
 * i.e. after Next has decoded the query string once. The encoded forms are
 * included as they would arrive from a double-encoded link.
 */
const HOSTILE_VALUES = [
  "//evil.com",
  "/\\evil.com",
  "https://evil.com",
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "%2F%2Fevil.com",
  "%252F%252Fevil.com",
  "/furniture",
  "furniture/../../evil",
  "furniture?next=//evil.com",
  "furniture#x",
  "furniture&next=//evil.com",
  " furniture",
  "furniture ",
  "Furniture",
  "FURNITURE",
  "furniture\u0000",
  "",
  "unknown-shortcut",
  "__proto__",
  "constructor",
  "toString",
] as const;

test.describe("parseGoodsParam", () => {
  test("accepts every shortcut code exactly", () => {
    for (const { code } of GOODS_SHORTCUTS) {
      expect(parseGoodsParam(code)).toBe(code);
    }
  });

  test("rejects hostile and unknown values", () => {
    for (const value of HOSTILE_VALUES) {
      expect(parseGoodsParam(value), JSON.stringify(value)).toBeNull();
    }
  });

  test("treats a missing or repeated key as no answer", () => {
    expect(parseGoodsParam(null)).toBeNull();
    expect(parseGoodsParam(undefined)).toBeNull();
    // Next surfaces `?goods=a&goods=b` as an array — even two valid codes.
    expect(parseGoodsParam(["furniture", "boxes"])).toBeNull();
    expect(parseGoodsParam(["furniture"])).toBeNull();
  });

  test("does not decode a second time", () => {
    // Round-trips through the real parser: an encoded slash in the address bar
    // is decoded once by URLSearchParams and must still be rejected.
    const fromUrl = new URLSearchParams("goods=%2F%2Fevil.com").get(
      GOODS_PARAM,
    );
    expect(fromUrl).toBe("//evil.com");
    expect(parseGoodsParam(fromUrl)).toBeNull();

    const doubleEncoded = new URLSearchParams("goods=%252F%252Fevil.com").get(
      GOODS_PARAM,
    );
    expect(parseGoodsParam(doubleEncoded)).toBeNull();
  });
});

test.describe("appendGoodsParam", () => {
  test("sets a valid code alongside the existing params", () => {
    const params = new URLSearchParams({ role: "client", type: "individual" });
    appendGoodsParam(params, "boxes");
    expect(params.toString()).toBe("role=client&type=individual&goods=boxes");
  });

  test("leaves the query untouched for anything else", () => {
    for (const value of [...HOSTILE_VALUES, null, undefined]) {
      const params = new URLSearchParams({ role: "client" });
      appendGoodsParam(params, value);
      expect(params.toString(), JSON.stringify(value)).toBe("role=client");
    }
  });
});

test.describe("withGoodsParam", () => {
  test("appends a valid code to an app path", () => {
    expect(withGoodsParam("/sign-up", "furniture")).toBe(
      "/sign-up?goods=furniture",
    );
    expect(withGoodsParam("/", "moving-home")).toBe("/?goods=moving-home");
  });

  test("joins with & when the path already has a query", () => {
    expect(withGoodsParam("/sign-in?role=client", "chilled")).toBe(
      "/sign-in?role=client&goods=chilled",
    );
  });

  test("returns the path bare when there is no valid code", () => {
    for (const value of [...HOSTILE_VALUES, null, undefined]) {
      expect(withGoodsParam("/sign-up", value), JSON.stringify(value)).toBe(
        "/sign-up",
      );
    }
  });

  test("never decorates an off-site or scheme target", () => {
    for (const path of [
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "evil.com",
    ]) {
      expect(withGoodsParam(path, "furniture")).toBe(path);
    }
  });

  test("every produced URL stays on this origin", () => {
    const origin = "https://zomo.example";

    for (const { code } of GOODS_SHORTCUTS) {
      for (const path of ["/", "/sign-up", "/sign-in?role=client"]) {
        const url = new URL(withGoodsParam(path, code), origin);
        expect(url.origin).toBe(origin);
        expect(url.searchParams.get(GOODS_PARAM)).toBe(code);
      }
    }
  });
});

test.describe("postAuthDestination", () => {
  test("carries the shortcut to the client home page", () => {
    expect(postAuthDestination("/", "appliances")).toBe("/?goods=appliances");
  });

  test("never decorates a provider destination", () => {
    // Drivers, companies and the merchant host land on `/dashboard`, which has
    // no booking form to open on a shortcut.
    expect(postAuthDestination("/dashboard", "appliances")).toBe("/dashboard");
    expect(postAuthDestination("/admin", "appliances")).toBe("/admin");
  });

  test("drops anything that is not a shortcut code", () => {
    for (const value of [...HOSTILE_VALUES, null, undefined]) {
      expect(postAuthDestination("/", value), JSON.stringify(value)).toBe("/");
    }
  });
});
