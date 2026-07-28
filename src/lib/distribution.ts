import { Wallet, type Client, type Payment, type TrustSet } from "xrpl";
import { CLAIM_AMOUNT, VRTY_CURRENCY_HEX, VRTY_ISSUER } from "./config";

let cachedWallet: Wallet | null = null;

export function loadDistributionWallet(): Wallet {
  if (cachedWallet) return cachedWallet;

  const seed = process.env.DISTRIBUTION_SEED?.trim();
  if (!seed) throw new Error("DISTRIBUTION_SEED is not configured");

  cachedWallet = Wallet.fromSeed(seed);
  return cachedWallet;
}

/**
 * Payments are signed one at a time.
 *
 * `autofill` reads the distribution wallet's next sequence number from the
 * ledger, so two concurrent claims would sign with the same sequence and one
 * would stall until its ledger gap expired. Serialising sign-and-submit keeps
 * every claim on a fresh sequence. Single-instance only — a shared lock is
 * needed before running replicas.
 */
let paymentChain: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = paymentChain.then(task, task);
  paymentChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export type PaymentAttempt = {
  hash: string;
  lastLedgerSequence: number | null;
};

/** Raised when the ledger accepted the transaction but rejected the payment. */
export class LedgerRejectedError extends Error {
  constructor(readonly engineResult: string) {
    super(describeEngineResult(engineResult));
    this.name = "LedgerRejectedError";
  }
}

/**
 * Sign and submit the claim payment, reporting the hash before submission so
 * an interrupted run can be reconciled instead of paying twice.
 */
export async function sendClaimPayment(
  client: Client,
  destination: string,
  onSigned: (attempt: PaymentAttempt) => Promise<void>
): Promise<{ hash: string }> {
  const wallet = loadDistributionWallet();

  return serialize(async () => {
    let lastError: unknown;

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

    // A retry covers the case where another signer consumed our sequence.
    for (let attempt = 0; attempt < 2; attempt++) {
      const prepared = await client.autofill(payment);

      const signed = wallet.sign(prepared);
      await onSigned({
        hash: signed.hash,
        lastLedgerSequence: prepared.LastLedgerSequence ?? null,
      });

      try {
        const result = await client.submitAndWait(signed.tx_blob);
        const engineResult = engineResultOf(result.result.meta);
        if (engineResult !== "tesSUCCESS") {
          throw new LedgerRejectedError(engineResult);
        }
        return { hash: signed.hash };
      } catch (err) {
        if (err instanceof LedgerRejectedError) throw err;
        if (!isSequenceConflict(err)) throw err;
        lastError = err;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Could not submit the payment");
  });
}

function isSequenceConflict(err: unknown): boolean {
  const message = String((err as Error)?.message ?? "");
  return /tefPAST_SEQ|terPRE_SEQ|tefALREADY|LastLedgerSequence/i.test(message);
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

/** Plain-language explanation for the ledger results we expect to see. */
export function describeEngineResult(engineResult: string): string {
  switch (engineResult) {
    case "tecPATH_DRY":
    case "tecUNFUNDED_PAYMENT":
      return "The distribution wallet is out of VRTY. Please try again later.";
    case "tecNO_LINE":
    case "tecNO_LINE_INSUF_RESERVE":
      return "Your wallet cannot hold VRTY yet — add the trust line and retry.";
    case "tecDST_TAG_NEEDED":
      return "That wallet requires a destination tag, so it cannot receive the claim.";
    case "tecNO_DST":
    case "tecNO_DST_INSUF_XRP":
      return "That wallet is not funded on the XRP Ledger.";
    case "tecNO_PERMISSION":
      return "That wallet does not accept payments from the distribution wallet.";
    default:
      return `The ledger rejected the payment (${engineResult}).`;
  }
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
