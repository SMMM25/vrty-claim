import {
  BALANCE_HOLD_DAYS,
  CLAIM_AMOUNT,
  CLAIM_CAP,
  isAddressLike,
  MIN_XRP,
} from "./config";
import { prisma } from "./db";
import { verifyContinuousXrpHold } from "./balance-hold";
import { checkSybil } from "./sybil";
import { hasVrtyTrustLine, getVrtyBalance } from "./distribution";
import { connectXrpl } from "./xrpl";

export type EligibilityResponse = {
  walletAddress: string;
  eligible: boolean;
  reasons: string[];
  claimAmount: string;
  claimCap: number;
  claimsRemaining: number;
  successCount: number;
  minXrp: number;
  holdDays: number;
  hasTrustLine: boolean;
  vrtyBalance: string;
  balanceHold: Awaited<ReturnType<typeof verifyContinuousXrpHold>>;
  sybil: { blocked: boolean; fundedBy: string | null; reason?: string };
  alreadyClaimed: boolean;
  ipBlocked: boolean;
};

export async function ensureCounter(): Promise<{ successCount: number }> {
  const row = await prisma.claimCounter.upsert({
    where: { id: 1 },
    create: { id: 1, successCount: 0 },
    update: {},
  });
  return { successCount: row.successCount };
}

export async function evaluateEligibility(
  walletAddress: string,
  ipAddress: string
): Promise<EligibilityResponse> {
  if (!isAddressLike(walletAddress)) {
    throw new Error("Invalid XRPL address");
  }

  const { successCount } = await ensureCounter();
  const claimsRemaining = Math.max(0, CLAIM_CAP - successCount);

  const existing = await prisma.claim.findUnique({
    where: { walletAddress },
  });
  const alreadyClaimed = existing?.status === "SUCCESS";

  const ipClaim = await prisma.claim.findFirst({
    where: { ipAddress, status: "SUCCESS" },
  });
  const ipBlocked = Boolean(ipClaim && ipClaim.walletAddress !== walletAddress);

  const client = await connectXrpl();
  try {
    const [balanceHold, sybil, trust, vrtyBalance] = await Promise.all([
      verifyContinuousXrpHold(client, walletAddress),
      checkSybil(client, walletAddress),
      hasVrtyTrustLine(client, walletAddress),
      getVrtyBalance(client, walletAddress),
    ]);

    const reasons: string[] = [];
    if (alreadyClaimed) reasons.push("This wallet has already claimed.");
    if (ipBlocked) reasons.push("A successful claim was already made from this IP.");
    if (claimsRemaining <= 0) reasons.push("Global claim cap reached (10,000).");
    if (!balanceHold.eligible) reasons.push(balanceHold.reason);
    if (sybil.blocked) reasons.push(sybil.reason);
    if (!trust) reasons.push("VRTY trust line required before claiming.");

    const eligible =
      !alreadyClaimed &&
      !ipBlocked &&
      claimsRemaining > 0 &&
      balanceHold.eligible &&
      !sybil.blocked &&
      trust;

    return {
      walletAddress,
      eligible,
      reasons,
      claimAmount: CLAIM_AMOUNT,
      claimCap: CLAIM_CAP,
      claimsRemaining,
      successCount,
      minXrp: MIN_XRP,
      holdDays: BALANCE_HOLD_DAYS,
      hasTrustLine: trust,
      vrtyBalance,
      balanceHold,
      sybil: {
        blocked: sybil.blocked,
        fundedBy: sybil.fundedBy,
        reason: sybil.blocked ? sybil.reason : undefined,
      },
      alreadyClaimed,
      ipBlocked,
    };
  } finally {
    await client.disconnect();
  }
}
