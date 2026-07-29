import { randomUUID } from "crypto";
import { ClaimStatus, type Claim } from "@prisma/client";
import type { Client } from "xrpl";
import { CLAIM_AMOUNT, CLAIM_CAP, isAddressLike } from "./config";
import { prisma } from "./db";
import { ensureCounter, evaluateEligibility } from "./eligibility";
import {
  LedgerRejectedError,
  lookupTransaction,
  sendClaimPayment,
} from "./distribution";
import { connectXrpl } from "./xrpl";

/** A claim that never reached submission is released after this long. */
const STALE_PENDING_MS = 15 * 60_000;

/** Last resort for a submitted claim with no recorded ledger expiry. */
const STUCK_SUBMITTED_MS = 60 * 60_000;

/** Statuses that occupy a slot against the global cap. */
const SLOT_HOLDING: ClaimStatus[] = [
  ClaimStatus.PENDING,
  ClaimStatus.SUBMITTED,
  ClaimStatus.SUCCESS,
];

export type ClaimErrorCode =
  | "INELIGIBLE"
  | "CAP_REACHED"
  | "ALREADY_CLAIMED"
  | "IP_BLOCKED"
  | "PAYMENT_FAILED"
  | "CONFIG"
  | "CONFLICT";

export type ClaimResult =
  | {
      ok: true;
      txHash: string;
      amount: string;
      walletAddress: string;
      successCount: number;
      claimsRemaining: number;
    }
  | {
      ok: false;
      error: string;
      code: ClaimErrorCode;
      reasons?: string[];
    };

class ClaimError extends Error {
  constructor(
    readonly code: ClaimErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ClaimError";
  }
}

/**
 * Reserve a slot, sign, submit, and record the distribution payment.
 *
 * The reservation locks the counter row so concurrent requests cannot oversell
 * the cap, and in-flight claims hold their slot until they succeed or fail.
 */
export async function executeClaim(params: {
  walletAddress: string;
  ipAddress: string;
  idempotencyKey?: string;
}): Promise<ClaimResult> {
  const walletAddress = params.walletAddress.trim();
  if (!isAddressLike(walletAddress)) {
    return { ok: false, error: "Invalid XRPL address.", code: "INELIGIBLE" };
  }

  const idempotencyKey = params.idempotencyKey?.trim() || randomUUID();
  await ensureCounter();

  const replay = await prisma.claim.findUnique({ where: { idempotencyKey } });
  if (replay?.status === ClaimStatus.SUCCESS && replay.txHash) {
    return successResult(replay.walletAddress, replay.txHash, replay.amount);
  }

  let client: Client;
  try {
    client = await connectXrpl();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "XRPL unavailable.",
      code: "PAYMENT_FAILED",
    };
  }

  try {
    const recovered = await reconcileSubmitted(client, walletAddress);
    if (recovered) return recovered;

    const eligibility = await evaluateEligibility(
      walletAddress,
      params.ipAddress,
      { client }
    );
    if (!eligibility.eligible) {
      return {
        ok: false,
        error: eligibility.reasons[0] ?? "This wallet is not eligible.",
        code: ineligibleCode(eligibility),
        reasons: eligibility.reasons,
      };
    }

    const claimId = await reserveSlot({
      walletAddress,
      ipAddress: params.ipAddress,
      fundedBy: eligibility.sybil.fundedBy,
      idempotencyKey,
    });

    return await payReservedClaim(client, claimId, walletAddress);
  } catch (err) {
    if (err instanceof ClaimError) {
      return { ok: false, error: err.message, code: err.code };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Claim failed.",
      code: "PAYMENT_FAILED",
    };
  } finally {
    await client.disconnect();
  }
}

function ineligibleCode(eligibility: {
  alreadyClaimed: boolean;
  ipBlocked: boolean;
  claimsRemaining: number;
}): ClaimErrorCode {
  if (eligibility.alreadyClaimed) return "ALREADY_CLAIMED";
  if (eligibility.ipBlocked) return "IP_BLOCKED";
  if (eligibility.claimsRemaining <= 0) return "CAP_REACHED";
  return "INELIGIBLE";
}

/**
 * Resolve a claim left in SUBMITTED by an interrupted run: settle it from the
 * ledger rather than risking a second payment.
 */
async function reconcileSubmitted(
  client: Client,
  walletAddress: string
): Promise<ClaimResult | null> {
  const claim = await prisma.claim.findUnique({ where: { walletAddress } });
  if (!claim || claim.status !== ClaimStatus.SUBMITTED || !claim.txHash) {
    return null;
  }

  const onLedger = await lookupTransaction(client, claim.txHash);

  if (onLedger?.validated && onLedger.engineResult === "tesSUCCESS") {
    return finalizeSuccess(claim.id, claim.txHash, walletAddress, claim.amount);
  }

  if (onLedger?.validated) {
    await markFailed(claim.id, `Ledger rejected: ${onLedger.engineResult}`);
    return null;
  }

  // Not validated: only safe to retry once the transaction can no longer pass.
  if (claim.lastLedgerSeq !== null) {
    const currentLedger = await client.getLedgerIndex();
    if (currentLedger > claim.lastLedgerSeq) {
      await markFailed(claim.id, "Transaction expired without validation");
      return null;
    }
  } else if (Date.now() - claim.updatedAt.getTime() > STUCK_SUBMITTED_MS) {
    // No expiry recorded: release the slot rather than wedging the wallet.
    await markFailed(claim.id, "Submission could not be confirmed");
    return null;
  }

  return {
    ok: false,
    error: "A claim for this wallet is still settling. Try again in a minute.",
    code: "CONFLICT",
  };
}

async function reserveSlot(input: {
  walletAddress: string;
  ipAddress: string;
  fundedBy: string | null;
  idempotencyKey: string;
}): Promise<string> {
  try {
    return await prisma.$transaction(async (tx) => {
      // Serialize reservations against the single counter row.
      await tx.$queryRaw`SELECT "id" FROM "ClaimCounter" WHERE "id" = 1 FOR UPDATE`;

      await tx.claim.updateMany({
        where: {
          status: ClaimStatus.PENDING,
          updatedAt: { lt: new Date(Date.now() - STALE_PENDING_MS) },
        },
        data: {
          status: ClaimStatus.FAILED,
          failReason: "Abandoned before submission",
        },
      });

      const taken = await tx.claim.count({
        where: { status: { in: SLOT_HOLDING } },
      });
      if (taken >= CLAIM_CAP) {
        throw new ClaimError(
          "CAP_REACHED",
          `All ${CLAIM_CAP.toLocaleString()} claims have been taken.`
        );
      }

      const existing = await tx.claim.findUnique({
        where: { walletAddress: input.walletAddress },
        select: { status: true },
      });
      if (existing?.status === ClaimStatus.SUCCESS) {
        throw new ClaimError(
          "ALREADY_CLAIMED",
          "This wallet has already claimed."
        );
      }
      if (
        existing?.status === ClaimStatus.PENDING ||
        existing?.status === ClaimStatus.SUBMITTED
      ) {
        throw new ClaimError(
          "CONFLICT",
          "A claim for this wallet is already in progress."
        );
      }

      const ipTaken = await tx.claim.findFirst({
        where: {
          ipAddress: input.ipAddress,
          status: ClaimStatus.SUCCESS,
          walletAddress: { not: input.walletAddress },
        },
        select: { id: true },
      });
      if (ipTaken) {
        throw new ClaimError(
          "IP_BLOCKED",
          "A successful claim was already made from this network."
        );
      }

      const claim = await tx.claim.upsert({
        where: { walletAddress: input.walletAddress },
        create: {
          walletAddress: input.walletAddress,
          ipAddress: input.ipAddress,
          fundedBy: input.fundedBy,
          amount: CLAIM_AMOUNT,
          status: ClaimStatus.PENDING,
          idempotencyKey: input.idempotencyKey,
        },
        update: {
          ipAddress: input.ipAddress,
          fundedBy: input.fundedBy,
          amount: CLAIM_AMOUNT,
          status: ClaimStatus.PENDING,
          idempotencyKey: input.idempotencyKey,
          failReason: null,
          txHash: null,
          lastLedgerSeq: null,
        },
        select: { id: true },
      });

      return claim.id;
    });
  } catch (err) {
    if (err instanceof ClaimError) throw err;
    if (err instanceof Error && /Unique constraint/i.test(err.message)) {
      throw new ClaimError(
        "CONFLICT",
        "Another claim is in progress. Please retry."
      );
    }
    throw err;
  }
}

async function payReservedClaim(
  client: Client,
  claimId: string,
  walletAddress: string
): Promise<ClaimResult> {
  let submitted = false;

  try {
    const { hash } = await sendClaimPayment(
      client,
      walletAddress,
      async ({ hash: signedHash, lastLedgerSequence }) => {
        // Recorded before submission so an interrupted run can be reconciled.
        await prisma.claim.update({
          where: { id: claimId },
          data: {
            status: ClaimStatus.SUBMITTED,
            txHash: signedHash,
            lastLedgerSeq: lastLedgerSequence,
          },
        });
        submitted = true;
      }
    );

    return finalizeSuccess(claimId, hash, walletAddress, CLAIM_AMOUNT);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);

    if (/DISTRIBUTION_(SEED|SECRET_NUMBERS|WALLET)/.test(reason)) {
      await markFailed(claimId, reason);
      throw new ClaimError(
        "CONFIG",
        "The distribution wallet is not configured."
      );
    }

    // A validated rejection consumed the sequence, so retrying cannot double-pay.
    if (err instanceof LedgerRejectedError) {
      await markFailed(claimId, `Ledger rejected: ${err.engineResult}`);
      throw new ClaimError("PAYMENT_FAILED", err.message);
    }

    if (!submitted) {
      await markFailed(claimId, reason);
      throw new ClaimError(
        "PAYMENT_FAILED",
        "The payment could not be started. Please try again."
      );
    }

    // The transaction may still settle. Leave it SUBMITTED so the next attempt
    // reconciles it against the ledger rather than paying twice.
    throw new ClaimError(
      "CONFLICT",
      "Your claim was submitted but has not settled yet. Check back in a minute."
    );
  }
}

/** Mark success and count it exactly once, even if called twice. */
async function finalizeSuccess(
  claimId: string,
  txHash: string,
  walletAddress: string,
  amount: string
): Promise<ClaimResult> {
  const successCount = await prisma.$transaction(async (tx) => {
    const transitioned = await tx.claim.updateMany({
      where: { id: claimId, status: { not: ClaimStatus.SUCCESS } },
      data: {
        status: ClaimStatus.SUCCESS,
        txHash,
        completedAt: new Date(),
        failReason: null,
      },
    });

    if (transitioned.count === 0) {
      const counter = await tx.claimCounter.findUniqueOrThrow({
        where: { id: 1 },
        select: { successCount: true },
      });
      return counter.successCount;
    }

    const counter = await tx.claimCounter.update({
      where: { id: 1 },
      data: { successCount: { increment: 1 } },
      select: { successCount: true },
    });
    return counter.successCount;
  });

  return {
    ok: true,
    txHash,
    amount,
    walletAddress,
    successCount,
    claimsRemaining: Math.max(0, CLAIM_CAP - successCount),
  };
}

async function markFailed(claimId: string, reason: string): Promise<void> {
  await prisma.claim.update({
    where: { id: claimId },
    data: { status: ClaimStatus.FAILED, failReason: reason.slice(0, 500) },
  });
}

async function successResult(
  walletAddress: string,
  txHash: string,
  amount: Claim["amount"]
): Promise<ClaimResult> {
  const { successCount } = await ensureCounter();
  return {
    ok: true,
    txHash,
    amount,
    walletAddress,
    successCount,
    claimsRemaining: Math.max(0, CLAIM_CAP - successCount),
  };
}
