import { NextResponse } from "next/server";
import { requireXumm } from "@/lib/xumm";

export const dynamic = "force-dynamic";

/** Poll a Xaman payload by UUID. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await ctx.params;
  if (!uuid || uuid.length < 8) {
    return NextResponse.json({ error: "Invalid uuid" }, { status: 400 });
  }

  try {
    const xumm = requireXumm();
    const payload = await xumm.payload.get(uuid);
    if (!payload) {
      return NextResponse.json({ error: "Payload not found" }, { status: 404 });
    }

    return NextResponse.json({
      meta: payload.meta,
      response: payload.response,
      application: payload.application,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lookup failed" },
      { status: 500 }
    );
  }
}
