import { XummSdk } from "xumm-sdk";

let cached: XummSdk | null = null;

export function getXumm(): XummSdk | null {
  const key = process.env.NEXT_PUBLIC_XUMM_API_KEY?.trim();
  const secret = process.env.XUMM_API_SECRET?.trim();
  if (!key || !secret) return null;
  if (!cached) cached = new XummSdk(key, secret);
  return cached;
}

export function requireXumm(): XummSdk {
  const sdk = getXumm();
  if (!sdk) {
    throw new Error("Xaman credentials are not configured");
  }
  return sdk;
}
