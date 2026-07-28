import { Wallet, type Client, type Payment, type TrustSet } from "xrpl";
import { CLAIM_AMOUNT, VRTY_CURRENCY_HEX, VRTY_ISSUER } from "./config";

let cachedWallet: Wallet | null = null;

export function loadDistributionWallet(): Wallet {
  if (cachedWallet) return cachedWallet;

  const seed = process.env.DISTRIBUTION_SEED?.trim();
  if (!seed) {
    throw new Error("DISTRIBUTION_SEED is not configured");
  }

  cachedWallet = Wallet.fromSeed(seed);
  return cachedWallet;
}

export type SignedPayment = {
  hash: string;
  txBlob: string;
  lastLedgerSequence: number | null;
};

/**
 * Sign the claim payment without submitting it. The hash is recorded before
 * submission so a crash mid-flight can be reconciled instead of paying twice.
 */
export async function signClaimPayment(
  client: Client,
  destination: string
): Promise<SignedPayment> {
  const wallet = loadDistributionWallet();

  const payment: Payment = {
    TransactionType: "Payment",
    Account: wallet.classicAddress,
    Destination: destination,
    Amount: {
      currency: VRTY_CURRENCY_HEX,
      issuer: VRTY_ISSUER,
      value: CLAIM_AMOUNT,
    },
  };

  const prepared = await client.autofill(payment);
  const signed = wallet.sign(prepared);

  return {
    hash: signed.hash,
    txBlob: signed.tx_blob,
    lastLedgerSequence: prepared.LastLedgerSequence ?? null,
  };
}

export async function submitSignedPayment(
  client: Client,
  txBlob: string
): Promise<{ engineResult: string }> {
  const result = await client.submitAndWait(txBlob);
  return { engineResult: engineResultOf(result.result.meta) };
}

/** Ledger state of a previously submitted transaction. */
export async function lookupTransaction(
  client: Client,
  hash: string
): Promise<{ validated: boolean; engineResult: string } | null> {
  try {
    const res = await client.request({ command: "tx", transaction: hash });
    return {
      validated: Boolean(res.result.validated),
      engineResult: engineResultOf(res.result.meta),
    };
  } catch (err) {
    if (/txnNotFound/i.test(String((err as Error)?.message ?? ""))) return null;
    throw err;
  }
}

function engineResultOf(meta: unknown): string {
  if (meta && typeof meta === "object" && "TransactionResult" in meta) {
    return String((meta as { TransactionResult: unknown }).TransactionResult);
  }
  return "unknown";
}

export function buildTrustSetTx(account: string): TrustSet {
  return {
    TransactionType: "TrustSet",
    Account: account,
    LimitAmount: {
      currency: VRTY_CURRENCY_HEX,
      issuer: VRTY_ISSUER,
      value: "1000000000",
    },
  };
}

/** VRTY trust line state for a holder, in a single ledger request. */
export async function getVrtyLine(
  client: Client,
  address: string
): Promise<{ hasLine: boolean; balance: string }> {
  const res = await client.request({
    command: "account_lines",
    account: address,
    peer: VRTY_ISSUER,
    ledger_index: "validated",
  });

  const line = res.result.lines.find(
    (l) =>
      l.account === VRTY_ISSUER &&
      (l.currency === "VRTY" || l.currency === VRTY_CURRENCY_HEX)
  );

  return { hasLine: Boolean(line), balance: line?.balance ?? "0" };
}
