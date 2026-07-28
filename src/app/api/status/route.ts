import { NextResponse } from "next/server";
import { CLAIM_AMOUNT, CLAIM_CAP, MIN_XRP, BALANCE_HOLD_DAYS } from "@/lib/config";
import { ensureCounter } from "@/lib/eligibility";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { successCount } = await ensureCounter();
    return NextResponse.json({
      ok: true,
      claimAmount: CLAIM_AMOUNT,
      claimCap: CLAIM_CAP,
      successCount,
      claimsRemaining: Math.max(0, CLAIM_CAP - successCount),
      minXrp: MIN_XRP,
      holdDays: BALANCE_HOLD_DAYS,
      distributionConfigured: Boolean(process.env.DISTRIBUTION_SEED?.trim()),
      xamanConfigured: Boolean(
        process.env.NEXT_PUBLIC_XUMM_API_KEY?.trim() &&
          process.env.XUMM_API_SECRET?.trim()
      ),
      turnstileConfigured: Boolean(process.env.TURNSTILE_SECRET_KEY?.trim()),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Status check failed",
        claimAmount: CLAIM_AMOUNT,
        claimCap: CLAIM_CAP,
        successCount: 0,
        claimsRemaining: CLAIM_CAP,
        minXrp: MIN_XRP,
        holdDays: BALANCE_HOLD_DAYS,
      },
      { status: 503 }
    );
  }
}
