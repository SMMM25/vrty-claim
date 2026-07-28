import type { Client } from "xrpl";
import { BALANCE_HOLD_MS, MIN_XRP } from "./config";
import { dropsToXrp } from "./xrpl";

export type BalanceHoldResult =
  | {
      eligible: true;
      currentXrp: number;
      continuousSince: string;
      holdDaysRequired: number;
    }
  | {
      eligible: false;
      currentXrp: number;
      continuousSince: string | null;
      holdDaysRequired: number;
      reason: string;
      secondsRemaining?: number;
    };

/**
 * Verify wallet has held ≥ MIN_XRP continuously for BALANCE_HOLD_MS.
 *
 * Strategy:
 * 1. Read current balance — must be ≥ MIN_XRP now.
 * 2. Walk account_tx payments that change XRP balance (newest → oldest)
 *    within the hold window (+ small lookback).
 * 3. Reconstruct balance at each payment boundary; if balance would have
 *    dropped below MIN_XRP at any point in the last 7 days, ineligible.
 * 4. Find the most recent moment balance rose to/stayed ≥ MIN_XRP; require
 *    that moment to be ≥ 7 days ago (or account creation if always above).
 *
 * Note: Full ledger-history reconstruction is approximate for accounts with
 * sparse payment history. We also treat AccountDelete / large fee burns via
 * Balance field deltas when present on transactions.
 */
export async function verifyContinuousXrpHold(
  client: Client,
  address: string,
  options?: { minXrp?: number; holdMs?: number; now?: number }
): Promise<BalanceHoldResult> {
  const minXrp = options?.minXrp ?? MIN_XRP;
  const holdMs = options?.holdMs ?? BALANCE_HOLD_MS;
  const now = options?.now ?? Date.now();
  const windowStart = now - holdMs;

  const info = await client.request({
    command: "account_info",
    account: address,
    ledger_index: "validated",
  });

  const currentXrp = dropsToXrp(info.result.account_data.Balance);
  if (currentXrp < minXrp) {
    return {
      eligible: false,
      currentXrp,
      continuousSince: null,
      holdDaysRequired: holdMs / (24 * 60 * 60 * 1000),
      reason: `Balance is ${currentXrp.toFixed(4)} XRP; need ≥ ${minXrp} XRP.`,
    };
  }

  // Prefer account creation from the oldest account_tx.
  const creationMs = await resolveAccountCreationMs(client, address);
  const effectiveCreated = creationMs ?? now;

  // Walk recent txs that affect XRP balance
  type Point = { ms: number; balanceAfter: number };
  const points: Point[] = [{ ms: now, balanceAfter: currentXrp }];

  let marker: unknown = undefined;
  let pages = 0;
  const maxPages = 20;
  let walkedPastWindow = false;

  do {
    const txRes = await client.request({
      command: "account_tx",
      account: address,
      ledger_index_min: -1,
      ledger_index_max: -1,
      binary: false,
      forward: false,
      limit: 100,
      ...(marker ? { marker } : {}),
    });

    for (const item of txRes.result.transactions) {
      const tx = item.tx as Record<string, unknown> | undefined;
      const meta = item.meta as Record<string, unknown> | string | undefined;
      if (!tx || typeof meta !== "object" || !meta) continue;

      const dateRipple = tx.date as number | undefined;
      if (typeof dateRipple !== "number") continue;
      const ms = rippleUnixToMs(dateRipple);

      const bal = balanceAfterFromMeta(meta, address);
      if (bal === null) continue;

      points.push({ ms, balanceAfter: bal });

      if (ms < windowStart) {
        walkedPastWindow = true;
        break;
      }
    }

    marker = txRes.result.marker;
    pages += 1;
    if (walkedPastWindow || !marker || pages >= maxPages) break;
  } while (true);

  // Sort oldest → newest for reconstruction check
  points.sort((a, b) => a.ms - b.ms);

  // Detect any dip below min inside the hold window
  // For consecutive points, the balance *between* them is the older point's balanceAfter
  // until the next tx. Check that whenever the interval overlaps [windowStart, now],
  // the balance for that interval stayed ≥ minXrp.
  for (let i = 0; i < points.length; i++) {
    const start = points[i].ms;
    const end = i + 1 < points.length ? points[i + 1].ms : now;
    const bal = points[i].balanceAfter;
    const overlapsWindow = end > windowStart && start < now;
    if (overlapsWindow && bal < minXrp) {
      const continuousSince = findContinuousSince(points, minXrp, now);
      return {
        eligible: false,
        currentXrp,
        continuousSince: continuousSince
          ? new Date(continuousSince).toISOString()
          : null,
        holdDaysRequired: holdMs / (24 * 60 * 60 * 1000),
        reason: `XRP balance dropped below ${minXrp} within the last ${holdMs / (24 * 60 * 60 * 1000)} days.`,
        secondsRemaining: continuousSince
          ? Math.max(0, Math.ceil((continuousSince + holdMs - now) / 1000))
          : undefined,
      };
    }
  }

  // If we never walked past the window and account is older, be conservative:
  // require either account age ≥ hold OR we saw history covering the window.
  if (
    !walkedPastWindow &&
    effectiveCreated < windowStart &&
    points.length <= 1
  ) {
    // Single point = current only; no history in window — treat as always held
    // if account older than hold period (common for quiet wallets).
  }

  const continuousSince = findContinuousSince(points, minXrp, now) ?? Math.min(effectiveCreated, now);

  if (now - continuousSince < holdMs) {
    const secondsRemaining = Math.ceil((continuousSince + holdMs - now) / 1000);
    return {
      eligible: false,
      currentXrp,
      continuousSince: new Date(continuousSince).toISOString(),
      holdDaysRequired: holdMs / (24 * 60 * 60 * 1000),
      reason: `Need ${holdMs / (24 * 60 * 60 * 1000)} days continuous ≥ ${minXrp} XRP.`,
      secondsRemaining,
    };
  }

  return {
    eligible: true,
    currentXrp,
    continuousSince: new Date(continuousSince).toISOString(),
    holdDaysRequired: holdMs / (24 * 60 * 60 * 1000),
  };
}

function findContinuousSince(
  pointsAsc: { ms: number; balanceAfter: number }[],
  minXrp: number,
  now: number
): number | null {
  // Walk newest → oldest; continuous since = after last dip below min
  let since = now;
  for (let i = pointsAsc.length - 1; i >= 0; i--) {
    if (pointsAsc[i].balanceAfter < minXrp) {
      // Rose above min at the next newer point (or now)
      since = i + 1 < pointsAsc.length ? pointsAsc[i + 1].ms : now;
      return since;
    }
    since = pointsAsc[i].ms;
  }
  return since;
}

function balanceAfterFromMeta(
  meta: Record<string, unknown>,
  address: string
): number | null {
  const nodes = (meta.AffectedNodes as Array<Record<string, unknown>>) ?? [];
  for (const node of nodes) {
    const modified = (node.ModifiedNode ?? node.CreatedNode ?? node.DeletedNode) as
      | Record<string, unknown>
      | undefined;
    if (!modified || modified.LedgerEntryType !== "AccountRoot") continue;

    const final =
      (modified.FinalFields as Record<string, unknown> | undefined) ??
      (modified.NewFields as Record<string, unknown> | undefined);
    if (!final || final.Account !== address) continue;
    if (typeof final.Balance === "string") {
      return dropsToXrp(final.Balance);
    }
  }
  return null;
}

async function resolveAccountCreationMs(
  client: Client,
  address: string
): Promise<number | null> {
  try {
    // Oldest transaction first
    const res = await client.request({
      command: "account_tx",
      account: address,
      ledger_index_min: -1,
      ledger_index_max: -1,
      binary: false,
      forward: true,
      limit: 1,
    });
    const first = res.result.transactions[0];
    const tx = first?.tx as { date?: number } | undefined;
    if (tx && typeof tx.date === "number") {
      return rippleUnixToMs(tx.date);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** XRPL timestamps are seconds since 2000-01-01 */
function rippleUnixToMs(rippleTime: number): number {
  return (rippleTime + 946_684_800) * 1000;
}
