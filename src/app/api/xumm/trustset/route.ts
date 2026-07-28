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

/** Create a Xaman payload for TrustSet; the user signs and pays the reserve. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const limit = rateLimit(`trustset-xaman:${ip}`, 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      }
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

  try {
    const xumm = requireXumm();
    const created = await xumm.payload.create({
      txjson: { ...buildTrustSetTx(parsed.data.walletAddress) },
      options: { submit: true },
      custom_meta: {
        instruction: "Add the VRTY trust line to receive your claim",
      },
    });

    if (!created) {
      return NextResponse.json(
        { error: "Xaman did not return a sign request." },
        { status: 502 }
      );
    }

    return NextResponse.json({ uuid: created.uuid, refs: created.refs });
  } catch (err) {
    console.error("[xumm/trustset] payload creation failed", err);
    return NextResponse.json(
      { error: "Could not reach Xaman. Please try again." },
      { status: 502 }
    );
  }
}
