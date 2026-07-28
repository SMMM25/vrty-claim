import { NextResponse } from "next/server";
import { z } from "zod";
import { executeClaim, type ClaimErrorCode } from "@/lib/claim";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  walletAddress: z.string().min(25).max(64),
  turnstileToken: z.string().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

const STATUS_BY_CODE: Record<ClaimErrorCode, number> = {
  INELIGIBLE: 400,
  CAP_REACHED: 409,
  ALREADY_CLAIMED: 409,
  IP_BLOCKED: 409,
  CONFLICT: 409,
  CONFIG: 503,
  PAYMENT_FAILED: 502,
};

export async function POST(req: Request) {
  const ip = clientIp(req);
  const limit = rateLimit(`claim:${ip}`, 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please wait a moment." },
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
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const captcha = await verifyTurnstile(parsed.data.turnstileToken, ip);
  if (!captcha.ok) {
    return NextResponse.json(
      { ok: false, error: captcha.reason ?? "Captcha check failed." },
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
      return NextResponse.json(result, {
        status: STATUS_BY_CODE[result.code] ?? 400,
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[claim] unexpected failure", err);
    return NextResponse.json(
      {
        ok: false,
        error: "The claim could not be completed. Please try again.",
        code: "PAYMENT_FAILED",
      },
      { status: 500 }
    );
  }
}
