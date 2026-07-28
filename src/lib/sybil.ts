import type { Client } from "xrpl";
import { prisma } from "./db";

export type SybilResult =
  | { blocked: false; fundedBy: string | null }
  | { blocked: true; fundedBy: string | null; reason: string };

/**
 * Anti-sybil: resolve funding parent (first inbound Payment of XRP that
 * created/funded the account) and block if that parent — or a sibling
 * funded by the same parent — already claimed successfully.
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

  if (!fundedBy) {
    return { blocked: false, fundedBy: null };
  }

  // Parent already claimed?
  const parentClaim = await prisma.claim.findFirst({
    where: { walletAddress: fundedBy, status: "SUCCESS" },
  });
  if (parentClaim) {
    return {
      blocked: true,
      fundedBy,
      reason: "Funding parent wallet has already claimed.",
    };
  }

  // Sibling claimed? (another wallet with same fundedBy that succeeded)
  const siblingClaim = await prisma.claim.findFirst({
    where: {
      fundedBy,
      status: "SUCCESS",
      walletAddress: { not: walletAddress },
    },
  });
  if (siblingClaim) {
    return {
      blocked: true,
      fundedBy,
      reason: "A sibling wallet funded by the same parent has already claimed.",
    };
  }

  // Also check walletFunding cache for siblings that claimed under different fundedBy field
  const siblingWallets = await prisma.walletFunding.findMany({
    where: { fundedBy, walletAddress: { not: walletAddress } },
    select: { walletAddress: true },
  });
  if (siblingWallets.length > 0) {
    const siblingAddrs = siblingWallets.map((w) => w.walletAddress);
    const claim = await prisma.claim.findFirst({
      where: { walletAddress: { in: siblingAddrs }, status: "SUCCESS" },
    });
    if (claim) {
      return {
        blocked: true,
        fundedBy,
        reason: "A sibling wallet funded by the same parent has already claimed.",
      };
    }
  }

  return { blocked: false, fundedBy };
}

async function resolveFundedBy(
  client: Client,
  address: string
): Promise<string | null> {
  const cached = await prisma.walletFunding.findUnique({
    where: { walletAddress: address },
  });
  if (cached && cached.fundedBy !== undefined && cached.fundedBy !== null) {
    // Re-check if older than 7 days? Keep cache for Phase 1.
    const age = Date.now() - cached.checkedAt.getTime();
    if (age < 7 * 24 * 60 * 60 * 1000) {
      return cached.fundedBy;
    }
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

    for (const item of res.result.transactions) {
      const tx = item.tx as Record<string, unknown> | undefined;
      if (!tx) continue;
      if (tx.TransactionType !== "Payment") continue;
      if (tx.Destination !== address) continue;
      // Prefer XRP-creating payments (Amount as string drops)
      const amount = tx.Amount;
      if (typeof amount === "string") {
        const account = tx.Account;
        if (typeof account === "string" && account !== address) {
          return account;
        }
      }
    }

    // Fallback: first inbound payment of any kind
    for (const item of res.result.transactions) {
      const tx = item.tx as Record<string, unknown> | undefined;
      if (!tx || tx.TransactionType !== "Payment") continue;
      if (tx.Destination !== address) continue;
      const account = tx.Account;
      if (typeof account === "string" && account !== address) {
        return account;
      }
    }
  } catch {
    /* ignore — treat as unknown parent */
  }

  return null;
}
