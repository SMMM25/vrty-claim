import type { Client } from "xrpl";
import { prisma } from "./db";
import { normalizeTxEntry } from "./xrpl-tx";

const FUNDING_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

export type SybilResult = {
  blocked: boolean;
  fundedBy: string | null;
  reason?: string;
};

/**
 * Resolve the wallet's funding parent and block the claim when that parent —
 * or a sibling funded by the same parent — already claimed successfully.
 */
export async function checkSybil(
  client: Client,
  walletAddress: string
): Promise<SybilResult> {
  const fundedBy = await resolveFundedBy(client, walletAddress);

  await prisma.walletFunding.upsert({
    where: { walletAddress },
    create: { walletAddress, fundedBy },
    update: { fundedBy, checkedAt: new Date() },
  });

  if (!fundedBy) return { blocked: false, fundedBy: null };

  const parentClaimed = await prisma.claim.findFirst({
    where: { walletAddress: fundedBy, status: "SUCCESS" },
    select: { id: true },
  });
  if (parentClaimed) {
    return {
      blocked: true,
      fundedBy,
      reason: "The wallet that funded this account has already claimed.",
    };
  }

  // Siblings are recorded either on the claim itself or in the funding cache.
  const siblings = await prisma.walletFunding.findMany({
    where: { fundedBy, walletAddress: { not: walletAddress } },
    select: { walletAddress: true },
  });

  const siblingClaimed = await prisma.claim.findFirst({
    where: {
      status: "SUCCESS",
      walletAddress: { not: walletAddress },
      OR: [
        { fundedBy },
        ...(siblings.length
          ? [{ walletAddress: { in: siblings.map((s) => s.walletAddress) } }]
          : []),
      ],
    },
    select: { id: true },
  });

  if (siblingClaimed) {
    return {
      blocked: true,
      fundedBy,
      reason: "Another wallet funded by the same source has already claimed.",
    };
  }

  return { blocked: false, fundedBy };
}

/** The account that sent the first inbound XRP payment to this wallet. */
async function resolveFundedBy(
  client: Client,
  address: string
): Promise<string | null> {
  const cached = await prisma.walletFunding.findUnique({
    where: { walletAddress: address },
    select: { fundedBy: true, checkedAt: true },
  });
  if (
    cached?.fundedBy &&
    Date.now() - cached.checkedAt.getTime() < FUNDING_CACHE_MS
  ) {
    return cached.fundedBy;
  }

  try {
    const res = await client.request({
      command: "account_tx",
      account: address,
      ledger_index_min: -1,
      ledger_index_max: -1,
      binary: false,
      forward: true,
      limit: 20,
    });

    let fallback: string | null = null;

    for (const entry of res.result.transactions) {
      const tx = normalizeTxEntry(entry);
      if (!tx) continue;
      const { fields } = tx;
      if (fields.TransactionType !== "Payment") continue;
      if (fields.Destination !== address) continue;

      const sender = fields.Account;
      if (typeof sender !== "string" || sender === address) continue;

      // An XRP amount is a drops string; issued currencies are objects.
      if (typeof fields.Amount === "string") return sender;
      fallback ??= sender;
    }

    return fallback;
  } catch {
    return null;
  }
}
