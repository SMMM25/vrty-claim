"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/hooks/useWallet";

type Eligibility = {
  eligible: boolean;
  reasons: string[];
  claimAmount: string;
  claimsRemaining: number;
  successCount: number;
  claimCap: number;
  hasTrustLine: boolean;
  vrtyBalance: string;
  balanceHold: {
    eligible: boolean;
    currentXrp: number;
    continuousSince: string | null;
    reason?: string;
    secondsRemaining?: number;
  };
  alreadyClaimed: boolean;
  ipBlocked: boolean;
};

function formatCountdown(seconds?: number): string | null {
  if (seconds == null || seconds <= 0) return null;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ClaimPanel() {
  const { wallet, signTrustSet, xamanRefs } = useWallet();
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [trusting, setTrusting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    txHash: string;
    amount: string;
  } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet.address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Eligibility check failed");
      setEligibility(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    setSuccess(null);
    setEligibility(null);
    if (wallet) void refresh();
  }, [wallet, refresh]);

  useEffect(() => {
    if (!siteKey || typeof window === "undefined") return;
    const existing = document.querySelector(
      'script[data-vrty-turnstile="1"]'
    );
    if (existing) return;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.dataset.vrtyTurnstile = "1";
    document.body.appendChild(script);

    // @ts-expect-error Turnstile global callback
    window.onVrtyTurnstile = (token: string) => {
      setTurnstileToken(token);
    };
  }, [siteKey]);

  const onTrust = async () => {
    setTrusting(true);
    setError(null);
    const result = await signTrustSet();
    setTrusting(false);
    if (!result.ok) {
      setError(result.error || "TrustSet failed");
      return;
    }
    await refresh();
  };

  const onClaim = async () => {
    if (!wallet) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet.address,
          turnstileToken: turnstileToken || undefined,
          idempotencyKey:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `${wallet.address}-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Claim failed");
      }
      setSuccess({ txHash: data.txHash, amount: data.amount });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  };

  if (!wallet) return null;

  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-6 animate-fade-in">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-emerald-300">
          Claimed {success.amount} VRTY
        </h2>
        <p className="mt-2 text-sm text-slate-300 break-all">
          Transaction:{" "}
          <a
            className="text-violet-300 underline"
            href={`https://livenet.xrpl.org/transactions/${success.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {success.txHash}
          </a>
        </p>
        {eligibility && (
          <p className="mt-3 text-sm text-slate-400">
            Wallet VRTY balance: {eligibility.vrtyBalance}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-white">
          Eligibility
        </h2>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="text-sm text-violet-300 hover:text-violet-200 disabled:opacity-50"
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {eligibility && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <Stat
              label="Claims left"
              value={`${eligibility.claimsRemaining.toLocaleString()} / ${eligibility.claimCap.toLocaleString()}`}
            />
            <Stat
              label="Your XRP"
              value={`${eligibility.balanceHold.currentXrp.toFixed(2)} XRP`}
            />
            <Stat label="VRTY balance" value={eligibility.vrtyBalance} />
          </div>

          {!eligibility.balanceHold.eligible && (
            <p className="text-sm text-amber-200">
              {eligibility.balanceHold.reason}
              {formatCountdown(eligibility.balanceHold.secondsRemaining) && (
                <span className="ml-2 text-amber-100/80">
                  (~{formatCountdown(eligibility.balanceHold.secondsRemaining)}{" "}
                  remaining)
                </span>
              )}
            </p>
          )}

          {eligibility.reasons.length > 0 && !eligibility.eligible && (
            <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
              {eligibility.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}

          {eligibility.eligible && (
            <p className="text-sm text-emerald-300">
              Eligible to claim {eligibility.claimAmount} VRTY.
            </p>
          )}

          {!eligibility.hasTrustLine && !eligibility.alreadyClaimed && (
            <button
              type="button"
              disabled={trusting}
              onClick={() => void onTrust()}
              className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 font-semibold text-white shadow-lg shadow-violet-500/25 hover:scale-[1.01] transition disabled:opacity-60"
            >
              {trusting ? "Waiting for TrustSet…" : "Create VRTY trust line"}
            </button>
          )}

          {eligibility.hasTrustLine &&
            !eligibility.alreadyClaimed &&
            !eligibility.ipBlocked && (
              <div className="space-y-3">
                {siteKey && (
                  <div
                    className="cf-turnstile"
                    data-sitekey={siteKey}
                    data-callback="onVrtyTurnstile"
                  />
                )}
                <button
                  type="button"
                  disabled={
                    claiming ||
                    !eligibility.eligible ||
                    (Boolean(siteKey) && !turnstileToken)
                  }
                  onClick={() => void onClaim()}
                  className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3.5 font-semibold text-white shadow-lg shadow-violet-500/25 hover:scale-[1.01] transition disabled:opacity-50 disabled:hover:scale-100"
                >
                  {claiming
                    ? "Submitting claim…"
                    : `Claim ${eligibility.claimAmount} VRTY`}
                </button>
              </div>
            )}
        </div>
      )}

      {xamanRefs && (
        <div className="rounded-2xl border border-violet-500/30 bg-violet-950/40 p-5 text-center">
          <p className="text-sm text-violet-200 mb-3">Sign in Xaman</p>
          {xamanRefs.qrPng && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={xamanRefs.qrPng}
              alt="Xaman QR"
              className="mx-auto h-44 w-44 rounded-xl bg-white p-2"
            />
          )}
          {xamanRefs.deeplink && (
            <a
              href={xamanRefs.deeplink}
              className="mt-3 inline-block text-sm font-semibold text-violet-300 underline"
              target="_blank"
              rel="noreferrer"
            >
              Open in Xaman
            </a>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-rose-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
