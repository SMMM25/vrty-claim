"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { SignPrompt } from "@/components/WalletPicker";
import { Turnstile } from "@/components/Turnstile";

type Eligibility = {
  eligible: boolean;
  reasons: string[];
  claimAmount: string;
  claimsRemaining: number;
  claimCap: number;
  hasTrustLine: boolean;
  vrtyBalance: string;
  accountFound: boolean;
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

export function ClaimPanel() {
  const { wallet, signTrustSet, signRequest } = useWallet();
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [trusting, setTrusting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    txHash: string;
    amount: string;
  } | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");

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
      setError(err instanceof Error ? err.message : "Eligibility check failed");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    setSuccess(null);
    setEligibility(null);
    void refresh();
  }, [refresh]);

  const onTrust = async () => {
    setTrusting(true);
    setError(null);
    const result = await signTrustSet();
    setTrusting(false);
    if (!result.ok) {
      setError(result.error ?? "The trust line failed");
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
          turnstileToken: captchaToken || undefined,
          idempotencyKey: newIdempotencyKey(wallet.address),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Claim failed");
      setSuccess({ txHash: data.txHash, amount: data.amount });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
      await refresh();
    } finally {
      setClaiming(false);
    }
  };

  if (!wallet) {
    return (
      <p className="text-sm text-slate-400">
        Connect a wallet above to check your eligibility.
      </p>
    );
  }

  if (success) {
    return (
      <div className="animate-fade-in rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-6">
        <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-emerald-300">
          {success.amount} VRTY is on its way
        </h3>
        <p className="mt-2 break-all text-sm text-slate-300">
          Transaction{" "}
          <a
            className="text-violet-300 underline"
            href={`https://livenet.xrpl.org/transactions/${success.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {success.txHash}
          </a>
        </p>
      </div>
    );
  }

  const captchaReady = !siteKey || Boolean(captchaToken);

  return (
    <div className="animate-slide-up space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-white">
          Your eligibility
        </h3>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="text-sm text-violet-300 transition hover:text-violet-200 disabled:opacity-50"
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {loading && !eligibility && (
        <p className="text-sm text-slate-400">Reading the ledger…</p>
      )}

      {eligibility && (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap gap-3">
            <Stat
              label="Claims left"
              value={`${eligibility.claimsRemaining.toLocaleString()} of ${eligibility.claimCap.toLocaleString()}`}
            />
            <Stat
              label="Your XRP"
              value={`${eligibility.balanceHold.currentXrp.toFixed(2)} XRP`}
            />
            <Stat label="Your VRTY" value={eligibility.vrtyBalance} />
          </div>

          {eligibility.eligible ? (
            <p className="text-sm text-emerald-300">
              You can claim {eligibility.claimAmount} VRTY.
            </p>
          ) : (
            <ul className="space-y-1 pl-5 text-sm text-slate-300 [list-style:disc]">
              {eligibility.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}

          {eligibility.balanceHold.secondsRemaining ? (
            <p className="text-sm text-amber-200">
              Eligible in about{" "}
              {formatCountdown(eligibility.balanceHold.secondsRemaining)}, as
              long as the balance stays above the minimum.
            </p>
          ) : null}

          {eligibility.accountFound &&
            !eligibility.hasTrustLine &&
            !eligibility.alreadyClaimed && (
              <button
                type="button"
                disabled={trusting}
                onClick={() => void onTrust()}
                className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:scale-[1.01] disabled:opacity-60"
              >
                {trusting ? "Waiting for your signature…" : "Add VRTY trust line"}
              </button>
            )}

          {eligibility.hasTrustLine && eligibility.eligible && (
            <div className="space-y-3">
              {siteKey && (
                <Turnstile siteKey={siteKey} onToken={setCaptchaToken} />
              )}
              <button
                type="button"
                disabled={claiming || !captchaReady}
                onClick={() => void onClaim()}
                className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3.5 font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100"
              >
                {claiming
                  ? "Sending your VRTY…"
                  : `Claim ${eligibility.claimAmount} VRTY`}
              </button>
              {siteKey && !captchaToken && (
                <p className="text-xs text-slate-400">
                  Complete the check above to enable claiming.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {signRequest && <SignPrompt request={signRequest} />}

      {error && (
        <p className="text-sm text-rose-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function newIdempotencyKey(address: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${address}-${Date.now()}`;
}

function formatCountdown(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
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
