import { beforeEach, describe, expect, it } from "vitest";
import { clientIp, rateLimit, resetRateLimits } from "@/lib/rate-limit";
import { isAddressLike, VRTY_CURRENCY_HEX } from "@/lib/config";

describe("rateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows requests up to the limit, then blocks", () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("key", 3, 60_000).ok).toBe(true);
    }

    const blocked = rateLimit("key", 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks keys independently", () => {
    expect(rateLimit("a", 1, 60_000).ok).toBe(true);
    expect(rateLimit("a", 1, 60_000).ok).toBe(false);
    expect(rateLimit("b", 1, 60_000).ok).toBe(true);
  });
});

describe("clientIp", () => {
  const request = (headers: Record<string, string>) =>
    new Request("https://claim.example/api", { headers });

  it("prefers the Cloudflare header", () => {
    const ip = clientIp(
      request({
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.1, 10.0.0.1",
      })
    );

    expect(ip).toBe("203.0.113.7");
  });

  it("uses the leftmost forwarded address otherwise", () => {
    const ip = clientIp(request({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }));
    expect(ip).toBe("198.51.100.1");
  });

  it("reports unknown when no proxy header is present", () => {
    expect(clientIp(request({}))).toBe("unknown");
  });
});

describe("config", () => {
  it("accepts classic XRPL addresses and rejects others", () => {
    expect(isAddressLike("rBeHfq9vRjZ8Cth1sMbp2nJvExmxSxAH8f")).toBe(true);
    expect(isAddressLike("0xabc0000000000000000000000000000000000000")).toBe(
      false
    );
    expect(isAddressLike("")).toBe(false);
  });

  it("encodes VRTY as a 40-character hex currency", () => {
    expect(VRTY_CURRENCY_HEX).toHaveLength(40);
    expect(Buffer.from(VRTY_CURRENCY_HEX, "hex").subarray(0, 4).toString()).toBe(
      "VRTY"
    );
  });
});
