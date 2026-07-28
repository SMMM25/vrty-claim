import { NextResponse } from "next/server";
import { z } from "zod";
import { requireXumm } from "@/lib/xumm";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** SignIn request for Xaman / xApp connect */
  returnUrl: z.string().url().optional(),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`xumm-signin:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    /* empty body ok */
  }

  const parsed = bodySchema.safeParse(json);

  try {
    const xumm = requireXumm();
    const created = await xumm.payload.create({
      txjson: { TransactionType: "SignIn" },
      options: {
        return_url: parsed.success && parsed.data.returnUrl
          ? { web: parsed.data.returnUrl }
          : undefined,
      },
      custom_meta: {
        instruction: "Connect to VRTY Claim",
      },
    });

    if (!created) {
      return NextResponse.json({ error: "Failed to create SignIn" }, { status: 502 });
    }

    return NextResponse.json({
      uuid: created.uuid,
      refs: created.refs,
      pushed: created.pushed,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "SignIn failed" },
      { status: 500 }
    );
  }
}
