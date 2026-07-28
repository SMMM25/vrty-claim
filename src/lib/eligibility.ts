import type { Client } from "xrpl";
import {
  BALANCE_HOLD_DAYS,
  CLAIM_AMOUNT,
  CLAIM_CAP,
  isAddressLike,
  MIN_XRP,
} from "./config";
import { prisma } from "./db";
import {
  AccountNotFoundError,
  evaluateHold,
  fetchHoldHistory,
  type BalanceHoldResult,
} from "./balance-hold";
import { checkSybil, type SybilResult } from "./sybil";
import { getVrtyLine } from "./distribution";
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
  balanceHold: BalanceHoldResult;
  sybil: SybilResult;
  alreadyClaimed: boolean;
  ipBlocked: boolean;
  accountFound: boolean;
};

export async function ensureCounter(): Promise<{ successCount: number }> {
  const row = await prisma.claimCounter.upsert({
    where: { id: 1 },
    create: { id: 1, successCount: 0 },
    update: {},
    select: { successCount: true },
  });
  return row;
}

export async function evaluateEligibility(
  walletAddress: string,
  ipAddress: string,
  options?: { client?: Client }
): Promise<EligibilityResponse> {
  if (!isAddressLike(walletAddress)) {
    throw new Error("Invalid XRPL address");
  }

  const { successCount } = await ensureCounter();
  const claimsRemaining = Math.max(0, CLAIM_CAP - successCount);

  const existing = await prisma.claim.findUnique({
    where: { walletAddress },
    select: { status: true },
  });
  const alreadyClaimed = existing?.status === "SUCCESS";

  const ipClaim = await prisma.claim.findFirst({
    where: { ipAddress, status: "SUCCESS", walletAddress: { not: walletAddress } },
    select: { id: true },
  });
  const ipBlocked = Boolean(ipClaim);

  const base = {
    walletAddress,
    claimAmount: CLAIM_AMOUNT,
    claimCap: CLAIM_CAP,
    claimsRemaining,
    successCount,
    minXrp: MIN_XRP,
    holdDays: BALANCE_HOLD_DAYS,
  };

  const client = options?.client ?? (await connectXrpl());
  try {
    const history = await fetchHoldHistory(client, walletAddress);
    const [sybil, vrtyLine] = await Promise.all([
      checkSybil(client, walletAddress),
      getVrtyLine(client, walletAddress),
    ]);
    const balanceHold = evaluateHold({ history });

    const reasons: string[] = [];
    if (alreadyClaimed) reasons.push("This wallet has already claimed.");
    if (ipBlocked) {
      reasons.push("A successful claim was already made from this network.");
    }
    if (claimsRemaining <= 0) {
      reasons.push(`All ${CLAIM_CAP.toLocaleString()} claims have been taken.`);
    }
    if (!balanceHold.eligible && balanceHold.reason) {
      reasons.push(balanceHold.reason);
    }
    if (sybil.blocked && sybil.reason) reasons.push(sybil.reason);
    if (!vrtyLine.hasLine) {
      reasons.push("A VRTY trust line is required before claiming.");
    }

    return {
      ...base,
      eligible:
        !alreadyClaimed &&
        !ipBlocked &&
        claimsRemaining > 0 &&
        balanceHold.eligible &&
        !sybil.blocked &&
        vrtyLine.hasLine,
      reasons,
      hasTrustLine: vrtyLine.hasLine,
      vrtyBalance: vrtyLine.balance,
      balanceHold,
      sybil,
      alreadyClaimed,
      ipBlocked,
      accountFound: true,
    };
  } catch (err) {
    if (err instanceof AccountNotFoundError) {
      return {
        ...base,
        eligible: false,
        reasons: [
          "This wallet does not exist on the XRP Ledger yet. Fund it with at least 10 XRP and try again.",
        ],
        hasTrustLine: false,
        vrtyBalance: "0",
        balanceHold: {
          eligible: false,
          currentXrp: 0,
          continuousSince: null,
          holdDays: BALANCE_HOLD_DAYS,
          reason: "Account not funded on the XRP Ledger.",
        },
        sybil: { blocked: false, fundedBy: null },
        alreadyClaimed,
        ipBlocked,
        accountFound: false,
      };
    }
    throw err;
  } finally {
    if (!options?.client) await client.disconnect();
  }
}
