import { describe, expect, it } from "vitest";
import {
  beginConnectionCompletion,
  generateConnectNonce,
  type PendingConnection,
} from "../src/connect.js";

describe("Access connection nonce", () => {
  it("generates URL-safe nonces with sufficient entropy", () => {
    const first = generateConnectNonce();
    const second = generateConnectNonce();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
  });

  it("expires and consumes a nonce before completing the callback", () => {
    const now = Date.parse("2026-08-26T00:00:00Z");
    const pending: PendingConnection = {
      nonce: "a".repeat(64),
      expiresAt: now + 60_000,
      state: "pending",
    };

    const completing = beginConnectionCompletion(pending, pending.nonce, now);
    expect(completing).toEqual({ ...pending, state: "completing" });
    expect(beginConnectionCompletion(completing ?? undefined, pending.nonce, now)).toBeNull();
    expect(beginConnectionCompletion(pending, "b".repeat(64), now)).toBeNull();
    expect(beginConnectionCompletion(pending, pending.nonce, pending.expiresAt)).toBeNull();
  });
});
