// Reads server environment and calls an external service; server code only.
import "server-only";

import {
  chunk,
  EXPO_PUSH_MAX_MESSAGES_PER_REQUEST,
  resolvePushConfig,
  tokensToPrune,
  type PushConfig,
  type PushMessage,
} from "@/lib/push/rules";

/** What a send reports back. It never throws, so this is all a caller learns. */
export type PushSendResult = {
  /** Messages the push service acknowledged receiving. */
  accepted: number;
  /** Tokens the push service says are dead; the caller deletes them. */
  invalidTokens: string[];
};

/**
 * The seam push goes through. One implementation talks to Expo; the other does
 * nothing, and is what every deployment without push configured gets.
 */
export interface PushSender {
  /** False for the no-op sender — lets a caller skip work that only feeds it. */
  readonly enabled: boolean;
  send(messages: readonly PushMessage[]): Promise<PushSendResult>;
}

/** A hung push service must not hold a serverless invocation open. */
const SEND_TIMEOUT_MS = 5000;

const NOOP_SENDER: PushSender = {
  enabled: false,
  send: async () => ({ accepted: 0, invalidTokens: [] }),
};

function expoSender(
  config: Extract<PushConfig, { enabled: true }>,
): PushSender {
  /** One request of at most 100 messages. Failure is logged, never thrown. */
  const sendChunk = async (
    messages: readonly PushMessage[],
  ): Promise<PushSendResult> => {
    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
          // Expo's "enhanced security": required only when the project has it
          // switched on, harmless otherwise.
          ...(config.accessToken === null
            ? {}
            : { Authorization: `Bearer ${config.accessToken}` }),
        },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        // Not retried: an offer lives 30 seconds, and the app's own poll is
        // what delivers it when a push does not arrive.
        console.error(`Push send failed: HTTP ${response.status}`);
        return { accepted: 0, invalidTokens: [] };
      }

      const body: unknown = await response.json();
      const invalidTokens = tokensToPrune(
        messages.map((message) => message.to),
        body,
      );

      return {
        accepted: messages.length - invalidTokens.length,
        invalidTokens,
      };
    } catch (error) {
      console.error("Push send failed:", error);
      return { accepted: 0, invalidTokens: [] };
    }
  };

  return {
    enabled: true,
    send: async (messages) => {
      const results = await Promise.all(
        chunk(messages, EXPO_PUSH_MAX_MESSAGES_PER_REQUEST).map(sendChunk),
      );

      return {
        accepted: results.reduce((sum, result) => sum + result.accepted, 0),
        invalidTokens: results.flatMap((result) => result.invalidTokens),
      };
    },
  };
}

/**
 * The sender for this deployment: Expo when `EXPO_PUSH_ENABLED=true`, a no-op
 * otherwise. Read at call time, not import time, so a changed environment
 * variable needs no rebuild.
 */
export function getPushSender(): PushSender {
  const config = resolvePushConfig({
    nodeEnv: process.env.NODE_ENV,
    expoPushEnabled: process.env.EXPO_PUSH_ENABLED,
    expoAccessToken: process.env.EXPO_ACCESS_TOKEN,
    expoPushApiUrl: process.env.EXPO_PUSH_API_URL,
  });

  return config.enabled ? expoSender(config) : NOOP_SENDER;
}
