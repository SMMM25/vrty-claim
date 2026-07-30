import { NextResponse } from "next/server";
import { requireXumm } from "@/lib/xumm";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type CachedPayload = {
  body: {
    meta: {
      resolved: boolean;
      signed: boolean;
      cancelled: boolean;
      expired: boolean;
    };
    response: { account?: string | null; txid?: string | null };
  };
  expiresAt: number;
};

/**
 * Resolved payloads are terminal, so a short cache stops the browser's polling
 * loop from re-hitting the Xaman API once a request is signed or rejected.
 * Single-instance only, same as the rate limiter.
 */
const resolvedPayloadCache = new Map<string, CachedPayload>();
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHED_PAYLOADS = 5_000;

function pruneCache(now: number): void {
  for (const [key, entry] of resolvedPayloadCache) {
    if (entry.expiresAt <= now) resolvedPayloadCache.delete(key);
  }
  // Expiry alone cannot bound the map during a sustained burst.
  while (resolvedPayloadCache.size > MAX_CACHED_PAYLOADS) {
    const oldest = resolvedPayloadCache.keys().next();
    if (oldest.done) break;
    resolvedPayloadCache.delete(oldest.value);
  }
}

/**
 * Poll a Xaman sign request. Only the fields the browser needs are returned —
 * the raw payload also carries push tokens and application details.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await ctx.params;
  if (!/^[0-9a-fA-F-]{36}$/.test(uuid)) {
    return NextResponse.json({ error: "Invalid sign request." }, { status: 400 });
  }

  const limit = rateLimit(`xaman-poll:${clientIp(req)}`, 300, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }

  try {
    const now = Date.now();
    const cached = resolvedPayloadCache.get(uuid);
    if (cached) {
      if (cached.expiresAt > now) return NextResponse.json(cached.body);
      resolvedPayloadCache.delete(uuid);
    }

    const payload = await requireXumm().payload.get(uuid);
    if (!payload) {
      return NextResponse.json(
        { error: "That sign request no longer exists." },
        { status: 404 }
      );
    }

    const body = {
      meta: {
        resolved: payload.meta.resolved,
        signed: payload.meta.signed,
        cancelled: payload.meta.cancelled,
        expired: payload.meta.expired,
      },
      response: {
        account: payload.response.account,
        txid: payload.response.txid,
      },
    };

    if (payload.meta.resolved) {
      if (resolvedPayloadCache.size >= MAX_CACHED_PAYLOADS) pruneCache(now);
      resolvedPayloadCache.set(uuid, { body, expiresAt: now + CACHE_TTL_MS });
    }

    return NextResponse.json(body);
  } catch (err) {
    console.error("[xumm/payload] lookup failed", err);
    return NextResponse.json(
      { error: "Could not reach Xaman. Please try again." },
      { status: 502 }
    );
  }
}
