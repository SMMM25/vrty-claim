import { NextResponse } from "next/server";
import {
  BALANCE_HOLD_DAYS,
  CLAIM_AMOUNT,
  CLAIM_CAP,
  MIN_XRP,
} from "@/lib/config";
import { isDistributionConfigured } from "@/lib/distribution";
import { ensureCounter } from "@/lib/eligibility";

export const dynamic = "force-dynamic";

const RULES = {
  claimAmount: CLAIM_AMOUNT,
  claimCap: CLAIM_CAP,
  minXrp: MIN_XRP,
  holdDays: BALANCE_HOLD_DAYS,
};

export async function GET() {
  try {
    const { successCount } = await ensureCounter();
    return NextResponse.json({
      ok: true,
      ...RULES,
      successCount,
      claimsRemaining: Math.max(0, CLAIM_CAP - successCount),
      configured: {
        distribution: isDistributionConfigured(),
        xaman: Boolean(
          process.env.NEXT_PUBLIC_XUMM_API_KEY?.trim() &&
            process.env.XUMM_API_SECRET?.trim()
        ),
        captcha: Boolean(process.env.TURNSTILE_SECRET_KEY?.trim()),
      },
    });
  } catch (err) {
    console.error("[status] counter unavailable", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Claim status is temporarily unavailable.",
        ...RULES,
        successCount: 0,
        claimsRemaining: CLAIM_CAP,
      },
      { status: 503 }
    );
  }
}
