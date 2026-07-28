import { describe, expect, it } from "vitest";
import { evaluateHold, type HoldHistory } from "@/lib/balance-hold";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 28, 12, 0, 0);
const HOLD_MS = 7 * DAY;
const MIN_XRP = 10;

function history(overrides: Partial<HoldHistory>): HoldHistory {
  return {
    currentXrp: 25,
    points: [],
    coversWindow: true,
    accountCreatedMs: null,
    ...overrides,
  };
}

function evaluate(overrides: Partial<HoldHistory>) {
  return evaluateHold({
    history: history(overrides),
    now: NOW,
    minXrp: MIN_XRP,
    holdMs: HOLD_MS,
  });
}

describe("evaluateHold", () => {
  it("rejects a wallet below the minimum right now", () => {
    const result = evaluate({
      currentXrp: 4.2,
      points: [{ ms: NOW - 30 * DAY, balanceAfter: 4.2 }],
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("4.20 XRP");
    expect(result.continuousSince).toBeNull();
  });

  it("rejects when history does not reach back far enough to verify", () => {
    const result = evaluate({
      coversWindow: false,
      points: [{ ms: NOW - 2 * DAY, balanceAfter: 25 }],
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/could not verify/i);
  });

  it("accepts a wallet that stayed above the minimum across the window", () => {
    const result = evaluate({
      points: [
        { ms: NOW - 40 * DAY, balanceAfter: 30 },
        { ms: NOW - 3 * DAY, balanceAfter: 25 },
      ],
    });

    expect(result.eligible).toBe(true);
    expect(result.continuousSince).toBe(new Date(NOW - 40 * DAY).toISOString());
  });

  it("restarts the timer when the balance dipped inside the window", () => {
    const result = evaluate({
      points: [
        { ms: NOW - 40 * DAY, balanceAfter: 30 },
        { ms: NOW - 5 * DAY, balanceAfter: 9.5 },
        { ms: NOW - 2 * DAY, balanceAfter: 25 },
      ],
    });

    expect(result.eligible).toBe(false);
    expect(result.continuousSince).toBe(new Date(NOW - 2 * DAY).toISOString());
    expect(result.secondsRemaining).toBe((5 * DAY) / 1000);
    expect(result.reason).toMatch(/restarted/i);
  });

  it("ignores a dip that finished before the window opened", () => {
    const result = evaluate({
      points: [
        { ms: NOW - 40 * DAY, balanceAfter: 2 },
        { ms: NOW - 20 * DAY, balanceAfter: 25 },
      ],
    });

    expect(result.eligible).toBe(true);
    expect(result.continuousSince).toBe(new Date(NOW - 20 * DAY).toISOString());
  });

  it("counts the hold from account creation for a new wallet", () => {
    const created = NOW - 3 * DAY;
    const result = evaluate({
      accountCreatedMs: created,
      points: [{ ms: created, balanceAfter: 25 }],
    });

    expect(result.eligible).toBe(false);
    expect(result.secondsRemaining).toBe((4 * DAY) / 1000);
    expect(result.reason).toMatch(/of the required 7 days/);
  });

  it("treats a balance exactly at the minimum as held", () => {
    const result = evaluate({
      currentXrp: 10,
      points: [
        { ms: NOW - 30 * DAY, balanceAfter: 10 },
        { ms: NOW - DAY, balanceAfter: 10 },
      ],
    });

    expect(result.eligible).toBe(true);
  });

  it("refuses when coverage is claimed but no balance was ever observed", () => {
    const result = evaluate({ coversWindow: true, points: [] });

    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/could not verify/i);
  });

  it("uses the latest dip when several occurred", () => {
    const result = evaluate({
      points: [
        { ms: NOW - 30 * DAY, balanceAfter: 1 },
        { ms: NOW - 20 * DAY, balanceAfter: 25 },
        { ms: NOW - 6 * DAY, balanceAfter: 3 },
        { ms: NOW - 4 * DAY, balanceAfter: 25 },
      ],
    });

    expect(result.eligible).toBe(false);
    expect(result.continuousSince).toBe(new Date(NOW - 4 * DAY).toISOString());
  });
});
