import { Wallet, type Client } from "xrpl";
import {
  CLAIM_AMOUNT,
  VRTY_CURRENCY_HEX,
  VRTY_ISSUER,
} from "./config";

export function loadDistributionWallet(): Wallet {
  const seed = process.env.DISTRIBUTION_SEED?.trim();
  if (seed) {
    return Wallet.fromSeed(seed);
  }

  const secrets = process.env.DISTRIBUTION_SECRET_NUMBERS?.trim();
  if (secrets) {
    // Space-separated family seed numbers are uncommon; prefer classic seed.
    throw new Error(
      "DISTRIBUTION_SECRET_NUMBERS is not supported yet — set DISTRIBUTION_SEED."
    );
  }

  throw new Error("DISTRIBUTION_SEED is not configured");
}

/**
 * Submit Payment of CLAIM_AMOUNT VRTY from the distribution hot wallet.
 * Must only be called after DB reservation / lock succeeds.
 */
export async function sendClaimPayment(
  client: Client,
  destination: string
): Promise<{ hash: string; engineResult: string }> {
  const wallet = loadDistributionWallet();

  const prepared = await client.autofill({
    TransactionType: "Payment",
    Account: wallet.classicAddress,
    Destination: destination,
    Amount: {
      currency: VRTY_CURRENCY_HEX,
      issuer: VRTY_ISSUER,
      value: CLAIM_AMOUNT,
    },
  });

  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);

  const meta = result.result.meta;
  const engineResult =
    typeof meta === "object" && meta && "TransactionResult" in meta
      ? String((meta as { TransactionResult: string }).TransactionResult)
      : "unknown";

  if (engineResult !== "tesSUCCESS") {
    throw new Error(`Payment failed on ledger: ${engineResult}`);
  }

  return { hash: signed.hash, engineResult };
}

export function buildTrustSetTx(account: string) {
  return {
    TransactionType: "TrustSet" as const,
    Account: account,
    LimitAmount: {
      currency: VRTY_CURRENCY_HEX,
      issuer: VRTY_ISSUER,
      value: "1000000000",
    },
  };
}

export async function hasVrtyTrustLine(
  client: Client,
  address: string
): Promise<boolean> {
  const lines = await client.request({
    command: "account_lines",
    account: address,
    peer: VRTY_ISSUER,
    ledger_index: "validated",
  });

  return lines.result.lines.some(
    (line) =>
      line.account === VRTY_ISSUER &&
      (line.currency === "VRTY" || line.currency === VRTY_CURRENCY_HEX)
  );
}

export async function getVrtyBalance(
  client: Client,
  address: string
): Promise<string> {
  const lines = await client.request({
    command: "account_lines",
    account: address,
    peer: VRTY_ISSUER,
    ledger_index: "validated",
  });

  const line = lines.result.lines.find(
    (l) =>
      l.account === VRTY_ISSUER &&
      (l.currency === "VRTY" || l.currency === VRTY_CURRENCY_HEX)
  );
  return line?.balance ?? "0";
}
