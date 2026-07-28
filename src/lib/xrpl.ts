import { Client } from "xrpl";
import { XRPL_ENDPOINTS } from "./config";

/**
 * Connect to the first healthy XRPL websocket endpoint.
 * Caller must call client.disconnect() when finished.
 */
export async function connectXrpl(
  endpoints: string[] = XRPL_ENDPOINTS
): Promise<Client> {
  let lastError: unknown;
  for (const url of endpoints) {
    const client = new Client(url, { connectionTimeout: 12_000 });
    try {
      await client.connect();
      return client;
    } catch (err) {
      lastError = err;
      try {
        await client.disconnect();
      } catch {
        /* endpoint already unusable */
      }
    }
  }
  throw new Error(
    `Unable to connect to XRPL (${endpoints.join(", ")}): ${String(lastError)}`
  );
}

/** Drops = 1e-6 XRP */
export function dropsToXrp(drops: string | number): number {
  return Number(drops) / 1_000_000;
}

export function xrpToDrops(xrp: number): string {
  return String(Math.round(xrp * 1_000_000));
}

/** rippled reports unfunded or non-existent accounts as `actNotFound`. */
export function isAccountNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const data = (err as { data?: { error?: unknown } }).data;
  if (data && typeof data === "object" && data.error === "actNotFound") {
    return true;
  }
  return /actNotFound/i.test(String((err as Error).message ?? ""));
}
