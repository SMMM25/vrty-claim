import { randomUUID } from "crypto";
import { CLAIM_AMOUNT, CLAIM_CAP, isAddressLike } from "./config";
import { prisma } from "./db";
import { evaluateEligibility, ensureCounter } from "./eligibility";
import { sendClaimPayment } from "./distribution";
import { connectXrpl } from "./xrpl";

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
      code:
        | "INELIGIBLE"
        | "CAP_REACHED"
        | "ALREADY_CLAIMED"
        | "IP_BLOCKED"
        | "PAYMENT_FAILED"
        | "CONFIG"
        | "CONFLICT";
      reasons?: string[];
    };

/**
 * Atomically reserve a claim slot, send Payment, then mark SUCCESS.
 * On payment failure, mark FAILED and do not increment the counter.
 */
export async function executeClaim(params: {
  walletAddress: string;
  ipAddress: string;
  idempotencyKey?: string;
}): Promise<ClaimResult> {
  const walletAddress = params.walletAddress.trim();
  if (!isAddressLike(walletAddress)) {
    return { ok: false, error: "Invalid XRPL address", code: "INELIGIBLE" };
  }

  const idempotencyKey = params.idempotencyKey?.trim() || randomUUID();

  // Idempotent replay
  const prior = await prisma.claim.findUnique({ where: { idempotencyKey } });
  if (prior?.status === "SUCCESS" && prior.txHash) {
    const { successCount } = await ensureCounter();
    return {
      ok: true,
      txHash: prior.txHash,
      amount: prior.amount,
      walletAddress: prior.walletAddress,
      successCount,
      claimsRemaining: Math.max(0, CLAIM_CAP - successCount),
    };
  }

  const eligibility = await evaluateEligibility(
    walletAddress,
    params.ipAddress
  );
  if (!eligibility.eligible) {
    const code = eligibility.alreadyClaimed
      ? "ALREADY_CLAIMED"
      : eligibility.ipBlocked
        ? "IP_BLOCKED"
        : eligibility.claimsRemaining <= 0
          ? "CAP_REACHED"
          : "INELIGIBLE";
    return {
      ok: false,
      error: eligibility.reasons[0] ?? "Not eligible",
      code,
      reasons: eligibility.reasons,
    };
  }

  // Reserve under serializable-ish transaction: check cap + unique wallet/ip
  let claimId: string;
  try {
    claimId = await prisma.$transaction(async (tx) => {
      const counter = await tx.claimCounter.upsert({
        where: { id: 1 },
        create: { id: 1, successCount: 0 },
        update: {},
      });

      if (counter.successCount >= CLAIM_CAP) {
        throw new Error("CAP_REACHED");
      }

      const existingWallet = await tx.claim.findUnique({
        where: { walletAddress },
      });
      if (existingWallet?.status === "SUCCESS") {
        throw new Error("ALREADY_CLAIMED");
      }
      if (
        existingWallet &&
        (existingWallet.status === "PENDING" ||
          existingWallet.status === "SUBMITTED")
      ) {
        throw new Error("CONFLICT");
      }

      const existingIp = await tx.claim.findFirst({
        where: { ipAddress: params.ipAddress, status: "SUCCESS" },
      });
      if (existingIp) {
        throw new Error("IP_BLOCKED");
      }

      const claim = await tx.claim.upsert({
        where: { walletAddress },
        create: {
          walletAddress,
          ipAddress: params.ipAddress,
          fundedBy: eligibility.sybil.fundedBy,
          amount: CLAIM_AMOUNT,
          status: "PENDING",
          idempotencyKey,
        },
        update: {
          ipAddress: params.ipAddress,
          fundedBy: eligibility.sybil.fundedBy,
          amount: CLAIM_AMOUNT,
          status: "PENDING",
          idempotencyKey,
          failReason: null,
          txHash: null,
        },
      });

      return claim.id;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "CAP_REACHED") {
      return { ok: false, error: "Global claim cap reached.", code: "CAP_REACHED" };
    }
    if (msg === "ALREADY_CLAIMED") {
      return {
        ok: false,
        error: "This wallet has already claimed.",
        code: "ALREADY_CLAIMED",
      };
    }
    if (msg === "IP_BLOCKED") {
      return {
        ok: false,
        error: "A successful claim was already made from this IP.",
        code: "IP_BLOCKED",
      };
    }
    if (msg === "CONFLICT") {
      return {
        ok: false,
        error: "A claim is already in progress for this wallet.",
        code: "CONFLICT",
      };
    }
    // Unique constraint on idempotencyKey / wallet
    if (msg.includes("Unique constraint")) {
      return {
        ok: false,
        error: "Claim conflict — retry with a new idempotency key.",
        code: "CONFLICT",
      };
    }
    throw err;
  }

  // Mark submitted then send payment
  await prisma.claim.update({
    where: { id: claimId },
    data: { status: "SUBMITTED" },
  });

  const client = await connectXrpl();
  try {
    const { hash } = await sendClaimPayment(client, walletAddress);

    const updated = await prisma.$transaction(async (tx) => {
      const claim = await tx.claim.update({
        where: { id: claimId },
        data: {
          status: "SUCCESS",
          txHash: hash,
          completedAt: new Date(),
          failReason: null,
        },
      });

      const counter = await tx.claimCounter.update({
        where: { id: 1 },
        data: { successCount: { increment: 1 } },
      });

      return { claim, counter };
    });

    return {
      ok: true,
      txHash: hash,
      amount: CLAIM_AMOUNT,
      walletAddress,
      successCount: updated.counter.successCount,
      claimsRemaining: Math.max(0, CLAIM_CAP - updated.counter.successCount),
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await prisma.claim.update({
      where: { id: claimId },
      data: { status: "FAILED", failReason: reason },
    });

    if (reason.includes("DISTRIBUTION_SEED")) {
      return {
        ok: false,
        error: "Distribution wallet is not configured.",
        code: "CONFIG",
      };
    }

    return {
      ok: false,
      error: `Payment failed: ${reason}`,
      code: "PAYMENT_FAILED",
    };
  } finally {
    await client.disconnect();
  }
}
