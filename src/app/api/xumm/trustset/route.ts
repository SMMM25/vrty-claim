import { NextResponse } from "next/server";
import { z } from "zod";
import { buildTrustSetTx } from "@/lib/distribution";
import { requireXumm } from "@/lib/xumm";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isAddressLike } from "@/lib/config";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  walletAddress: z.string().min(25).max(64),
});

/** Create a Xaman payload for TrustSet (user signs & pays reserve). */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`trustset:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

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

  try {
    const xumm = requireXumm();
    const tx = buildTrustSetTx(parsed.data.walletAddress);
    const created = await xumm.payload.create({
      txjson: tx as never,
      options: { submit: true },
      custom_meta: {
        instruction: "Create VRTY trust line to receive your claim",
      },
    });

    if (!created) {
      return NextResponse.json({ error: "Failed to create Xaman payload" }, { status: 502 });
    }

    return NextResponse.json({
      uuid: created.uuid,
      refs: created.refs,
      pushed: created.pushed,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "TrustSet payload failed" },
      { status: 500 }
    );
  }
}
