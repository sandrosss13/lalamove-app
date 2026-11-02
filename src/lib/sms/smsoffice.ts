/**
 * SMS delivery through smsoffice.ge, the Georgian SMS gateway.
 *
 * One call: `POST https://smsoffice.ge/api/v2/send/` with a form body of
 * `key`, `destination`, `sender`, `content` and `urgent`. The answer is JSON,
 * `{ Success, Message, Output, ErrorCode }`; only `Success === true` counts as
 * accepted. Everything else — a non-2xx status, a body that is not that shape,
 * a timeout — rejects, so the sign-in code is never reported as sent when it
 * was not.
 *
 * - `destination` is the number without the leading `+` (`995555123456`).
 * - `sender` must already be registered in the smsoffice.ge dashboard (at most
 *   11 Latin characters); an unregistered one is ErrorCode 150.
 * - `urgent=true` marks the message transactional, so it is delivered even to a
 *   number that has opted out of marketing SMS — right for sign-in codes, and
 *   the reason this sender must never be used for marketing.
 *
 * Credentials come from `SMSOFFICE_API_KEY` and `SMSOFFICE_SENDER`; the API key
 * and the message body are never logged.
 */

import type { SmsMessage, SmsSender } from "@/lib/sms/sender";

export const SMSOFFICE_SEND_URL = "https://smsoffice.ge/api/v2/send/";

/** Give up on smsoffice.ge after this long, so a hung request fails the send. */
const REQUEST_TIMEOUT_MS = 10_000;

/** What smsoffice.ge means by the ErrorCodes worth explaining in a log line. */
const ERROR_DESCRIPTIONS: Record<number, string> = {
  60: "content parameter is missing",
  70: "destination is empty",
  75: "every number is on the stop list",
  76: "every number is malformed",
  77: "every number is either stoplisted or malformed",
  80: "API key is incorrect",
  120: "API access is not enabled for this account",
  150: "sender is not registered",
  500: "key parameter is missing",
  600: "destination parameter is missing",
  700: "sender parameter is missing",
  800: "content parameter is missing",
  [-100]: "temporary delay",
};

export type SmsOfficeConfig = {
  apiKey: string;
  sender: string;
};

type SmsOfficeResponse = {
  Success: boolean;
  Message?: string | null;
  ErrorCode?: number | null;
};

function isSmsOfficeResponse(value: unknown): value is SmsOfficeResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { Success?: unknown }).Success === "boolean"
  );
}

/** Raised when smsoffice.ge did not accept a message. Carries no secrets. */
export class SmsOfficeError extends Error {
  constructor(
    message: string,
    readonly errorCode: number | null = null,
  ) {
    super(message);
    this.name = "SmsOfficeError";
  }
}

/**
 * The config from the environment, or `null` unless both variables are set.
 * A half-configured provider counts as none, so sign-in fails closed with
 * `SMS_NOT_CONFIGURED` rather than at the gateway.
 */
export function smsOfficeConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): SmsOfficeConfig | null {
  const apiKey = env.SMSOFFICE_API_KEY?.trim() ?? "";
  const sender = env.SMSOFFICE_SENDER?.trim() ?? "";

  return apiKey && sender ? { apiKey, sender } : null;
}

/** `+995555123456` → `995555123456`, the form smsoffice.ge expects. */
export function toSmsOfficeDestination(e164: string): string {
  return e164.replace(/^\+/, "");
}

export function createSmsOfficeSender(
  config: SmsOfficeConfig,
  fetchImpl: typeof fetch = fetch,
): SmsSender {
  return {
    async send({ to, body }: SmsMessage) {
      const form = new URLSearchParams({
        key: config.apiKey,
        destination: toSmsOfficeDestination(to),
        sender: config.sender,
        content: body,
        urgent: "true",
      });

      let response: Response;

      try {
        response = await fetchImpl(SMSOFFICE_SEND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        throw new SmsOfficeError(
          `smsoffice.ge request failed: ${error instanceof Error ? error.name : "unknown error"}`,
        );
      }

      if (!response.ok) {
        throw new SmsOfficeError(
          `smsoffice.ge answered HTTP ${response.status}`,
        );
      }

      const payload: unknown = await response.json().catch(() => null);

      if (!isSmsOfficeResponse(payload)) {
        throw new SmsOfficeError("smsoffice.ge answered with an unexpected body");
      }

      if (!payload.Success) {
        const code = payload.ErrorCode ?? null;
        const reason =
          (code !== null ? ERROR_DESCRIPTIONS[code] : undefined) ??
          payload.Message ??
          "no reason given";

        throw new SmsOfficeError(
          `smsoffice.ge rejected the message (ErrorCode ${code ?? "none"}: ${reason})`,
          code,
        );
      }
    },
  };
}
