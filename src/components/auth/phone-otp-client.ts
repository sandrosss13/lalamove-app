/**
 * The website's two calls to Better Auth's phone plugin, plus the profile and
 * session reads both phone screens lean on.
 *
 * Plain `fetch` rather than `authClient.phoneNumber.*`: the client plugin is
 * not registered in `@/lib/auth-client`, and these two endpoints are the only
 * ones of its surface the site uses — the server refuses the rest. A
 * same-origin `fetch` sends and receives the session cookie by default, so a
 * successful verify leaves the browser signed in exactly as `signIn.email`
 * does, and `authClient.getSession()` reads it straight after.
 *
 * Neither function throws: a refusal and a dropped connection both come back
 * as a `PhoneAuthFailure` the screen can render, mapped by the pure
 * `phoneAuthFailure` next door.
 */

import type { PhoneAuthIntent } from "@/lib/mobile-api/contracts";

import {
  phoneAuthFailure,
  phoneAuthHeaders,
  type PhoneAuthFailure,
  type PortalRole,
} from "./phone-auth-flow";

const SEND_OTP_URL = "/api/auth/phone-number/send-otp";
const VERIFY_URL = "/api/auth/phone-number/verify";

export type PhoneAuthResult = { ok: true } | ({ ok: false } & PhoneAuthFailure);

async function post(
  url: string,
  body: Record<string, string>,
  headers: Record<string, string>,
): Promise<PhoneAuthResult> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      // The default for a same-origin request, stated because the session
      // cookie arriving on the verify response is the whole point of it.
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, ...phoneAuthFailure(null, null) };
  }

  if (response.ok) {
    return { ok: true };
  }

  const payload = (await response.json().catch(() => null)) as {
    code?: unknown;
  } | null;
  const code = typeof payload?.code === "string" ? payload.code : null;

  return { ok: false, ...phoneAuthFailure(code, response.status) };
}

/**
 * Sends a code to an E.164 number. `email` is sign-up's optional address; the
 * server checks it before sending, so a taken address fails here, not after
 * the SMS.
 */
export function sendPhoneCode(
  phoneNumber: string,
  role: PortalRole,
  email?: string | null,
): Promise<PhoneAuthResult> {
  // Exactly the one documented key — any other is a 400.
  return post(SEND_OTP_URL, { phoneNumber }, phoneAuthHeaders({ role, email }));
}

/**
 * Verifies a code. On success the session cookie is set. `intent` has no
 * default on purpose: `sign-up` may create an account, `sign-in` never does.
 */
export function verifyPhoneCode(
  phoneNumber: string,
  code: string,
  intent: PhoneAuthIntent,
  role: PortalRole,
  email?: string | null,
): Promise<PhoneAuthResult> {
  return post(
    VERIFY_URL,
    { phoneNumber, code },
    phoneAuthHeaders({ role, intent, email }),
  );
}
