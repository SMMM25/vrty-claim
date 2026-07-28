import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluateEligibility } from "@/lib/eligibility";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  walletAddress: z.string().min(25).max(64),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`eligibility:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      { status: 429 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  try {
    const result = await evaluateEligibility(parsed.data.walletAddress, ip);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Eligibility check failed" },
      { status: 500 }
    );
  }
}
