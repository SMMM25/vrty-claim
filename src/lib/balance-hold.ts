import type { Client } from "xrpl";
import { BALANCE_HOLD_MS, MIN_XRP } from "./config";
import { dropsToXrp, isAccountNotFound } from "./xrpl";
import {
  accountRootBalanceAfter,
  createdAccountRoot,
  normalizeTxEntry,
} from "./xrpl-tx";

const DAY_MS = 24 * 60 * 60 * 1000;
const TX_PAGE_SIZE = 200;
const MAX_TX_PAGES = 25;

export class AccountNotFoundError extends Error {
  constructor(address: string) {
    super(`Account ${address} was not found on the XRP Ledger`);
    this.name = "AccountNotFoundError";
  }
}

/** A balance observation: `balanceAfter` holds from `ms` until the next point. */
export type HoldPoint = { ms: number; balanceAfter: number };

export type HoldHistory = {
  currentXrp: number;
  /** Ascending by time. */
  points: HoldPoint[];
  /** History reaches back past the window start (or to account creation). */
  coversWindow: boolean;
  accountCreatedMs: number | null;
};

export type BalanceHoldResult = {
  eligible: boolean;
  currentXrp: number;
  /** ISO timestamp the continuous hold began, when known. */
  continuousSince: string | null;
  holdDays: number;
  reason?: string;
  secondsRemaining?: number;
};

/**
 * Decide the continuous-hold rule from a balance history.
 *
 * Balance between two observations equals the older observation's balance, so
 * the history reduces to segments. The hold clock restarts at the end of the
 * most recent segment that fell below the minimum; with no such segment the
 * clock starts at account creation (or the oldest verified observation).
 */
export function evaluateHold(args: {
  history: HoldHistory;
  now?: number;
  minXrp?: number;
  holdMs?: number;
}): BalanceHoldResult {
  const { history } = args;
  const now = args.now ?? Date.now();
  const minXrp = args.minXrp ?? MIN_XRP;
  const holdMs = args.holdMs ?? BALANCE_HOLD_MS;
  const holdDays = holdMs / DAY_MS;
  const windowStart = now - holdMs;
  const { currentXrp, points, coversWindow, accountCreatedMs } = history;

  if (currentXrp < minXrp) {
    return {
      eligible: false,
      currentXrp,
      continuousSince: null,
      holdDays,
      reason: `Balance is ${currentXrp.toFixed(2)} XRP; ${minXrp} XRP is required.`,
    };
  }

  if (!coversWindow) {
    return {
      eligible: false,
      currentXrp,
      continuousSince: null,
      holdDays,
      reason: `Could not verify ${holdDays} days of balance history for this wallet.`,
    };
  }

  let lastDipEnd: number | null = null;
  for (let i = 0; i < points.length; i++) {
    if (points[i].balanceAfter >= minXrp) continue;
    const segmentEnd = i + 1 < points.length ? points[i + 1].ms : now;
    if (lastDipEnd === null || segmentEnd > lastDipEnd) lastDipEnd = segmentEnd;
  }

  const continuousSince =
    lastDipEnd ?? accountCreatedMs ?? points[0]?.ms ?? windowStart;
  const heldMs = now - continuousSince;

  if (heldMs >= holdMs) {
    return {
      eligible: true,
      currentXrp,
      continuousSince: new Date(continuousSince).toISOString(),
      holdDays,
    };
  }

  const heldDays = Math.max(0, heldMs / DAY_MS);
  return {
    eligible: false,
    currentXrp,
    continuousSince: new Date(continuousSince).toISOString(),
    holdDays,
    secondsRemaining: Math.ceil((continuousSince + holdMs - now) / 1000),
    reason:
      lastDipEnd !== null
        ? `Balance fell below ${minXrp} XRP on ${new Date(continuousSince).toISOString().slice(0, 10)}, which restarted the ${holdDays}-day timer.`
        : `Wallet has held ${minXrp} XRP for ${heldDays.toFixed(1)} of the required ${holdDays} days.`,
  };
}

/** Read the balance history needed to decide the hold rule. */
export async function fetchHoldHistory(
  client: Client,
  address: string,
  options?: { now?: number; holdMs?: number }
): Promise<HoldHistory> {
  const now = options?.now ?? Date.now();
  const windowStart = now - (options?.holdMs ?? BALANCE_HOLD_MS);

  let currentXrp: number;
  try {
    const info = await client.request({
      command: "account_info",
      account: address,
      ledger_index: "validated",
    });
    currentXrp = dropsToXrp(info.result.account_data.Balance);
  } catch (err) {
    if (isAccountNotFound(err)) throw new AccountNotFoundError(address);
    throw err;
  }

  const points: HoldPoint[] = [];
  let accountCreatedMs: number | null = null;
  let coversWindow = false;
  let marker: unknown;
  let pages = 0;

  while (pages < MAX_TX_PAGES && !coversWindow) {
    const page = await client.request({
      command: "account_tx",
      account: address,
      ledger_index_min: -1,
      ledger_index_max: -1,
      binary: false,
      forward: false,
      limit: TX_PAGE_SIZE,
      ...(marker ? { marker } : {}),
    });

    for (const entry of page.result.transactions) {
      const tx = normalizeTxEntry(entry);
      if (!tx || tx.ms === null) continue;

      const balanceAfter = accountRootBalanceAfter(tx.meta, address);
      if (balanceAfter !== null) {
        points.push({ ms: tx.ms, balanceAfter });
      }

      if (createdAccountRoot(tx.meta, address)) {
        accountCreatedMs = tx.ms;
        coversWindow = true;
        break;
      }
      // The newest observation older than the window start gives the balance
      // at the window boundary, so keep it and stop.
      if (tx.ms < windowStart) {
        coversWindow = true;
        break;
      }
    }

    marker = page.result.marker;
    pages += 1;
    if (!marker) break;
  }

  points.sort((a, b) => a.ms - b.ms);
  return { currentXrp, points, coversWindow, accountCreatedMs };
}

export async function verifyContinuousXrpHold(
  client: Client,
  address: string,
  options?: { minXrp?: number; holdMs?: number; now?: number }
): Promise<BalanceHoldResult> {
  const history = await fetchHoldHistory(client, address, options);
  return evaluateHold({ history, ...options });
}
