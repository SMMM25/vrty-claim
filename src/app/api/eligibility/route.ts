import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluateEligibility } from "@/lib/eligibility";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isAddressLike } from "@/lib/config";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  walletAddress: z.string().min(25).max(64),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  const limit = rateLimit(`eligibility:${ip}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many checks. Please wait a moment." },
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
    return NextResponse.json(
      await evaluateEligibility(parsed.data.walletAddress, ip)
    );
  } catch (err) {
    console.error("[eligibility] check failed", err);
    return NextResponse.json(
      { error: "Could not reach the XRP Ledger. Please try again." },
      { status: 502 }
    );
  }
}
