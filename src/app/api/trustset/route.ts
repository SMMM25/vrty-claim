import { NextResponse } from "next/server";
import { z } from "zod";
import { buildTrustSetTx } from "@/lib/distribution";
import { isAddressLike } from "@/lib/config";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  walletAddress: z.string().min(25).max(64),
});

/** Unsigned TrustSet for extension and WalletConnect wallets to sign. */
export async function POST(req: Request) {
  const limit = rateLimit(`trustset:${clientIp(req)}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success || !isAddressLike(parsed.data.walletAddress)) {
    return NextResponse.json(
      { error: "That does not look like an XRPL address." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    txJson: buildTrustSetTx(parsed.data.walletAddress),
  });
}
