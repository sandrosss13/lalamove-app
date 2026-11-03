/**
 * The one seam a transactional email provider plugs into — the email twin of
 * `@/lib/sms/sender`.
 *
 * The provider is Resend. `getEmailSender` returns a Resend-backed sender when
 * `RESEND_API_KEY` and `EMAIL_FROM` are both set, and `null` otherwise; what
 * the app does with that `null` is `@/lib/email/delivery`'s decision, not this
 * file's — in development it logs the message to the server console, and
 * everywhere else every email feature refuses up front (fails closed) rather
 * than pretending a message went out.
 *
 * Callers depend on `EmailSender` and nothing Resend-specific, so swapping the
 * provider later is: implement `EmailSender` in a file beside this one and
 * return it here. Nothing else in the app changes.
 *
 * Not `server-only`: `src/lib/auth.ts` imports this module, and that file is
 * also loaded by the seed scripts under `tsx`, where the `server-only` guard
 * throws on import. Nothing here is reachable from a client bundle — the only
 * importers are server modules — and the key is read from a non-`NEXT_PUBLIC_`
 * variable, which is `undefined` in the browser regardless.
 */

import { Resend } from "resend";

import {
  emailDeliveryMisconfiguration,
  resolveEmailDelivery,
  type EmailDelivery,
} from "@/lib/email/delivery";

export type EmailMessage = {
  to: string;
  subject: string;
  /** The HTML part. Every message also carries `text`, for plain-text clients. */
  html: string;
  text: string;
  /**
   * Resend drops a repeat send with the same key for 24 hours. Callers pass
   * something unique to the message (a reset token), so a retried request can
   * never mail the same link twice.
   */
  idempotencyKey?: string;
};

export interface EmailSender {
  /** Rejects when the provider did not accept the message. */
  send(message: EmailMessage): Promise<void>;
}

/** The deployment's delivery mode, read from the environment on each call. */
export function getEmailDelivery(): EmailDelivery {
  return resolveEmailDelivery({
    nodeEnv: process.env.NODE_ENV,
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM,
  });
}

// Said once per server process, at the first lookup, rather than on every
// send: a half-set configuration is a deploy-time mistake, and repeating it on
// every request would bury it.
let misconfigurationReported = false;

function reportMisconfigurationOnce(): void {
  if (misconfigurationReported) {
    return;
  }

  misconfigurationReported = true;
  const problem = emailDeliveryMisconfiguration({
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM,
  });

  if (problem) {
    console.error(`[email] ${problem}`);
  }
}

/**
 * Resend's SDK reports a refused message in its return value rather than by
 * throwing, so the error is turned into a rejection here — `EmailSender`'s
 * contract is that a promise which resolves means the provider accepted it.
 */
function resendSender(apiKey: string, from: string): EmailSender {
  const client = new Resend(apiKey);

  return {
    async send(message) {
      const { error } = await client.emails.send(
        {
          from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        },
        message.idempotencyKey
          ? { idempotencyKey: message.idempotencyKey }
          : undefined,
      );

      if (error) {
        throw new Error(
          `Resend refused the message (${error.name}${
            error.statusCode ? `, ${error.statusCode}` : ""
          }): ${error.message}`,
        );
      }
    },
  };
}

/** The configured provider, or `null` while there is none. */
export function getEmailSender(): EmailSender | null {
  reportMisconfigurationOnce();
  const delivery = getEmailDelivery();

  return delivery.mode === "PROVIDER"
    ? resendSender(delivery.apiKey, delivery.from)
    : null;
}
