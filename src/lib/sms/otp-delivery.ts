/**
 * How a phone sign-in code reaches its owner — the whole decision, as a pure
 * function of the environment and the number signing in.
 *
 * Four outcomes, and only four, checked in this order:
 *
 * - `DEV_FIXED_CODE` — no SMS is sent and the configured test code verifies,
 *   for every number. Requires **both** `NODE_ENV === "development"` **and** a
 *   well-formed `DEV_PHONE_OTP_CODE`. `next build`/`next start` (and therefore
 *   every Vercel deployment, preview included) run with
 *   `NODE_ENV === "production"`, so a test code left in a deployed environment
 *   is inert.
 * - `SMS_PROVIDER` — a real sender is configured; the plugin's own random code
 *   is sent and verified. A provider switches the staging code below off.
 * - `STAGING_TEST_CODE` — no SMS is sent and `STAGING_PHONE_OTP_CODE` verifies,
 *   but only for a number on the `STAGING_PHONE_OTP_NUMBERS` allowlist, only
 *   when `VERCEL_ENV === "preview"` (staging), and only while there is no
 *   provider. Vercel applies Preview variables to **every** preview branch, so
 *   both must be scoped to the `staging` branch in the Vercel dashboard.
 * - `UNCONFIGURED` — none of the above. The send and verify endpoints refuse
 *   with `SMS_NOT_CONFIGURED`; nothing is accepted.
 *
 * No runtime imports, so `tests/phone-otp-delivery.spec.ts` pins the gating
 * without a server. The allowlist arrives already normalised to E.164 (by
 * `src/lib/phone-auth.ts`), and is matched exactly.
 */

/** Length of every one-time code, real or test. */
export const PHONE_OTP_LENGTH = 6;

const FIXED_CODE_PATTERN = new RegExp(`^\\d{${PHONE_OTP_LENGTH}}$`);

/** The only `VERCEL_ENV` value under which the staging code can apply. */
const STAGING_VERCEL_ENV = "preview";

export type OtpDeliveryEnvironment = {
  nodeEnv: string | undefined;
  devPhoneOtpCode: string | undefined;
  vercelEnv: string | undefined;
  stagingPhoneOtpCode: string | undefined;
  /** E.164 numbers the staging code applies to. */
  stagingPhoneOtpNumbers: readonly string[];
  hasSmsProvider: boolean;
};

export type OtpDelivery =
  | { mode: "DEV_FIXED_CODE"; code: string }
  | { mode: "SMS_PROVIDER" }
  | { mode: "STAGING_TEST_CODE"; code: string }
  | { mode: "UNCONFIGURED" };

/**
 * A configured fixed code, trimmed, or `null` when it is not exactly six ASCII
 * digits. A malformed value is treated as unset rather than accepted in some
 * altered form.
 */
function wellFormedCode(value: string | undefined): string | null {
  const code = value?.trim() ?? "";

  return FIXED_CODE_PATTERN.test(code) ? code : null;
}

/**
 * The test code, or `null` unless this is a development process with a
 * well-formed code configured.
 */
export function resolveDevOtpCode(
  environment: Pick<OtpDeliveryEnvironment, "nodeEnv" | "devPhoneOtpCode">,
): string | null {
  if (environment.nodeEnv !== "development") {
    return null;
  }

  return wellFormedCode(environment.devPhoneOtpCode);
}

/**
 * The staging code, or `null` unless this is a staging deployment with no SMS
 * provider, a well-formed code and a non-empty allowlist. Says nothing about
 * any particular number — `resolveOtpDelivery` checks the allowlist.
 */
export function resolveStagingOtpCode(
  environment: Pick<
    OtpDeliveryEnvironment,
    | "vercelEnv"
    | "stagingPhoneOtpCode"
    | "stagingPhoneOtpNumbers"
    | "hasSmsProvider"
  >,
): string | null {
  if (
    environment.vercelEnv !== STAGING_VERCEL_ENV ||
    environment.hasSmsProvider ||
    environment.stagingPhoneOtpNumbers.length === 0
  ) {
    return null;
  }

  return wellFormedCode(environment.stagingPhoneOtpCode);
}

/**
 * See the module comment. The development code wins over a provider, in
 * development only; a provider wins over the staging code.
 */
export function resolveOtpDelivery(
  environment: OtpDeliveryEnvironment,
  phoneNumber: string,
): OtpDelivery {
  const devCode = resolveDevOtpCode(environment);

  if (devCode !== null) {
    return { mode: "DEV_FIXED_CODE", code: devCode };
  }

  if (environment.hasSmsProvider) {
    return { mode: "SMS_PROVIDER" };
  }

  const stagingCode = resolveStagingOtpCode(environment);

  if (
    stagingCode !== null &&
    environment.stagingPhoneOtpNumbers.includes(phoneNumber)
  ) {
    return { mode: "STAGING_TEST_CODE", code: stagingCode };
  }

  return { mode: "UNCONFIGURED" };
}
