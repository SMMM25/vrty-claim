/**
 * Claim portal constants.
 *
 * Values come from the environment but fall back to the launch rules, and
 * malformed numbers fall back rather than poisoning comparisons with NaN —
 * `taken >= NaN` is false, which would silently disable the claim cap.
 */

function positiveNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function decimalAmount(raw: string | undefined, fallback: string): string {
  const value = raw?.trim();
  if (!value || !/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0) {
    return fallback;
  }
  return value;
}

export const VRTY_ISSUER =
  process.env.NEXT_PUBLIC_VRTY_ISSUER?.trim() ||
  "rBeHfq9vRjZ8Cth1sMbp2nJvExmxSxAH8f";

/** On-ledger currency code: "VRTY" as 40-character padded hex. */
export const VRTY_CURRENCY_HEX = "5652545900000000000000000000000000000000";

export const CLAIM_AMOUNT = decimalAmount(
  process.env.NEXT_PUBLIC_CLAIM_AMOUNT,
  "58.9"
);
export const CLAIM_CAP = Math.floor(
  positiveNumber(process.env.NEXT_PUBLIC_CLAIM_CAP, 10_000)
);
export const MIN_XRP = positiveNumber(process.env.NEXT_PUBLIC_MIN_XRP, 10);
export const BALANCE_HOLD_DAYS = positiveNumber(
  process.env.NEXT_PUBLIC_BALANCE_HOLD_DAYS,
  7
);
export const BALANCE_HOLD_MS = BALANCE_HOLD_DAYS * 24 * 60 * 60 * 1000;

export const XRPL_ENDPOINTS = (
  process.env.XRPL_ENDPOINTS?.trim() ||
  "wss://xrplcluster.com,wss://s1.ripple.com,wss://s2.ripple.com"
)
  .split(",")
  .map((endpoint) => endpoint.trim())
  .filter(Boolean);

/** Classic XRPL addresses are base58 and 25–35 characters long. */
export function isAddressLike(value: string): boolean {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(value);
}
