/** Claim portal constants and env-backed config. */

export const VRTY_ISSUER =
  process.env.NEXT_PUBLIC_VRTY_ISSUER ?? "rBeHfq9vRjZ8Cth1sMbp2nJvExmxSxAH8f";

/** On-ledger currency code (padded hex for "VRTY"). */
export const VRTY_CURRENCY_HEX = "5652545900000000000000000000000000000000";

export const CLAIM_AMOUNT = process.env.NEXT_PUBLIC_CLAIM_AMOUNT ?? "58.9";
export const CLAIM_CAP = Number(process.env.NEXT_PUBLIC_CLAIM_CAP ?? "10000");
export const MIN_XRP = Number(process.env.NEXT_PUBLIC_MIN_XRP ?? "10");
export const BALANCE_HOLD_DAYS = Number(
  process.env.NEXT_PUBLIC_BALANCE_HOLD_DAYS ?? "7"
);
export const BALANCE_HOLD_MS = BALANCE_HOLD_DAYS * 24 * 60 * 60 * 1000;

export const XRPL_ENDPOINTS = (
  process.env.XRPL_ENDPOINTS ??
  "wss://xrplcluster.com,wss://s1.ripple.com,wss://s2.ripple.com"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isAddressLike(value: string): boolean {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(value);
}
