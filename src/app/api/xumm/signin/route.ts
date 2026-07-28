import { NextResponse } from "next/server";
import { z } from "zod";
import { requireXumm } from "@/lib/xumm";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  returnUrl: z.string().url().optional(),
});

/** Create a Xaman SignIn request so the user can share their address. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const limit = rateLimit(`xaman-signin:${ip}`, 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      }
    );
  }

  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    /* an empty body is valid here */
  }

  const parsed = bodySchema.safeParse(json);
  const returnUrl = parsed.success ? parsed.data.returnUrl : undefined;

  try {
    const xumm = requireXumm();
    const created = await xumm.payload.create({
      txjson: { TransactionType: "SignIn" },
      options: returnUrl ? { return_url: { web: returnUrl } } : undefined,
      custom_meta: { instruction: "Connect to the VRTY claim portal" },
    });

    if (!created) {
      return NextResponse.json(
        { error: "Xaman did not return a sign-in request." },
        { status: 502 }
      );
    }

    return NextResponse.json({ uuid: created.uuid, refs: created.refs });
  } catch (err) {
    console.error("[xumm/signin] payload creation failed", err);
    return NextResponse.json(
      { error: "Could not reach Xaman. Please try again." },
      { status: 502 }
    );
  }
}
