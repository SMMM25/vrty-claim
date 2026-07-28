import { NextResponse } from "next/server";
import { z } from "zod";
import { executeClaim } from "@/lib/claim";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  walletAddress: z.string().min(25).max(64),
  turnstileToken: z.string().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`claim:${ip}`, 10, 60_000);
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
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const captcha = await verifyTurnstile(parsed.data.turnstileToken, ip);
  if (!captcha.ok) {
    return NextResponse.json(
      { error: captcha.reason ?? "Captcha failed" },
      { status: 403 }
    );
  }

  try {
    const result = await executeClaim({
      walletAddress: parsed.data.walletAddress,
      ipAddress: ip,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    if (!result.ok) {
      const status =
        result.code === "CAP_REACHED"
          ? 409
          : result.code === "ALREADY_CLAIMED" || result.code === "IP_BLOCKED"
            ? 409
            : result.code === "CONFIG"
              ? 503
              : 400;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Claim failed",
        code: "PAYMENT_FAILED",
      },
      { status: 500 }
    );
  }
}
