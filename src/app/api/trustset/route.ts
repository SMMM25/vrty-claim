import { NextResponse } from "next/server";
import { z } from "zod";
import { buildTrustSetTx } from "@/lib/distribution";
import { isAddressLike } from "@/lib/config";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  walletAddress: z.string().min(25).max(64),
});

/** Return unsigned TrustSet txjson for GemWallet / Crossmark / WC signing. */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success || !isAddressLike(parsed.data.walletAddress)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  return NextResponse.json({
    txJson: buildTrustSetTx(parsed.data.walletAddress),
  });
}
