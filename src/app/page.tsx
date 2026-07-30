"use client";

import { useEffect, useState } from "react";
import { WalletPicker } from "@/components/WalletPicker";
import { ClaimPanel } from "@/components/ClaimPanel";
import { SiteFooter } from "@/components/SiteFooter";

type Status = {
  ok: boolean;
  claimAmount: string;
  claimCap: number;
  successCount: number;
  claimsRemaining: number;
  minXrp: number;
  holdDays: number;
};

export default function HomePage() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() =>
        setStatus({
          ok: false,
          claimAmount: "58.9",
          claimCap: 10000,
          successCount: 0,
          claimsRemaining: 10000,
          minXrp: 10,
          holdDays: 7,
        })
      );
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950" />
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: `linear-gradient(rgba(139, 92, 246, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139, 92, 246, 0.08) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />
      <div className="glow-orb pointer-events-none absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-violet-600/25 blur-3xl" />
      <div className="glow-orb pointer-events-none absolute bottom-10 right-1/4 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-16 pt-8 sm:px-6">
        <header className="mb-10 flex items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/30 font-[family-name:var(--font-display)] font-bold text-white">
              V
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-white">
                Verity Protocol
              </p>
              <p className="text-xs text-slate-400">VRTY Claim Portal</p>
            </div>
          </div>
          <a
            href="https://github.com/SMMM25/vrty-claim"
            className="hidden text-sm text-slate-400 hover:text-violet-300 transition sm:inline"
            target="_blank"
            rel="noreferrer"
          >
            Open source
          </a>
        </header>

        <section className="mb-10 animate-slide-up">
          <p className="mb-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Verity
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-100 sm:text-3xl">
            Claim{" "}
            <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              {status?.claimAmount ?? "58.9"} VRTY
            </span>
          </h1>
          <p className="mt-3 max-w-xl text-base text-slate-300">
            Hold at least {status?.minXrp ?? 10} XRP for{" "}
            {status?.holdDays ?? 7} continuous days, connect your wallet, and
            claim once. First {(status?.claimCap ?? 10000).toLocaleString()}{" "}
            wallets.
          </p>
          {status && (
            <p className="mt-4 text-sm text-violet-200/90">
              {(status.claimsRemaining ?? 0).toLocaleString()} claims remaining
            </p>
          )}
        </section>

        <section className="space-y-8 rounded-3xl border border-white/10 bg-slate-950/50 p-5 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8">
          <div>
            <h2 className="mb-4 font-[family-name:var(--font-display)] text-lg font-semibold text-white">
              1. Connect wallet
            </h2>
            <WalletPicker />
          </div>
          <div>
            <h2 className="mb-4 font-[family-name:var(--font-display)] text-lg font-semibold text-white">
              2. Trust line & claim
            </h2>
            <ClaimPanel />
          </div>
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}
