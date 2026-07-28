"use client";

import { useWallet, type WalletKind } from "@/hooks/useWallet";

const WALLETS: {
  kind: WalletKind;
  name: string;
  blurb: string;
  priority?: boolean;
}[] = [
  {
    kind: "xaman",
    name: "Xaman",
    blurb: "Mobile xApp / QR — recommended",
    priority: true,
  },
  { kind: "gemwallet", name: "GemWallet", blurb: "Browser extension" },
  { kind: "crossmark", name: "Crossmark", blurb: "Browser extension" },
  { kind: "bifrost", name: "Bifrost", blurb: "WalletConnect" },
];

export function WalletPicker() {
  const { connect, connecting, error, wallet, disconnect, xamanRefs } =
    useWallet();

  if (wallet) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-400">Connected via {wallet.kind}</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-white break-all">
              {wallet.address}
            </p>
          </div>
          <button
            type="button"
            onClick={disconnect}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 transition"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="grid gap-3 sm:grid-cols-2">
        {WALLETS.map((w) => (
          <button
            key={w.kind}
            type="button"
            disabled={connecting}
            onClick={() => connect(w.kind).catch(() => undefined)}
            className={`group relative overflow-hidden rounded-2xl border px-4 py-4 text-left transition hover:border-violet-500/50 hover:bg-white/10 disabled:opacity-60 ${
              w.priority
                ? "border-violet-500/40 bg-gradient-to-br from-violet-600/20 to-indigo-600/10"
                : "border-white/10 bg-white/5"
            }`}
          >
            <div className="font-[family-name:var(--font-display)] text-base font-semibold text-white">
              {w.name}
            </div>
            <div className="mt-1 text-sm text-slate-400">{w.blurb}</div>
            {w.priority && (
              <span className="mt-3 inline-block text-xs font-semibold uppercase tracking-wide text-violet-300">
                Priority
              </span>
            )}
          </button>
        ))}
      </div>

      {xamanRefs && (
        <div className="rounded-2xl border border-violet-500/30 bg-violet-950/40 p-5 text-center space-y-3">
          {xamanRefs.wcUri ? (
            <>
              <p className="text-sm text-violet-200">
                Open Bifrost and approve this WalletConnect URI
              </p>
              <p className="break-all rounded-xl bg-slate-950/60 p-3 text-left text-xs text-slate-300 font-mono">
                {xamanRefs.wcUri}
              </p>
              <button
                type="button"
                className="text-sm font-semibold text-violet-300 underline"
                onClick={() =>
                  navigator.clipboard?.writeText(xamanRefs.wcUri || "")
                }
              >
                Copy URI
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-violet-200">
                Scan with Xaman or open the deep link
              </p>
              {xamanRefs.qrPng && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={xamanRefs.qrPng}
                  alt="Xaman QR"
                  className="mx-auto h-48 w-48 rounded-xl bg-white p-2"
                />
              )}
              {xamanRefs.deeplink && (
                <a
                  href={xamanRefs.deeplink}
                  className="inline-block text-sm font-semibold text-violet-300 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Xaman
                </a>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-rose-300" role="alert">
          {error}
        </p>
      )}
      {connecting && (
        <p className="text-sm text-slate-400">Waiting for wallet…</p>
      )}
    </div>
  );
}
