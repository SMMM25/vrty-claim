"use client";

import { useWallet, type SignRequest, type WalletKind } from "@/hooks/useWallet";

const WALLETS: {
  kind: WalletKind;
  name: string;
  blurb: string;
  priority?: boolean;
}[] = [
  {
    kind: "xaman",
    name: "Xaman",
    blurb: "Mobile app or QR — recommended",
    priority: true,
  },
  { kind: "gemwallet", name: "GemWallet", blurb: "Browser extension" },
  { kind: "crossmark", name: "Crossmark", blurb: "Browser extension" },
  { kind: "bifrost", name: "Bifrost", blurb: "WalletConnect" },
];

export function WalletPicker() {
  const { connect, connecting, error, wallet, disconnect, signRequest } =
    useWallet();

  if (wallet) {
    return (
      <div className="animate-fade-in rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-400">
              Connected with {labelFor(wallet.kind)}
            </p>
            <p className="mt-1 break-all font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-white">
              {wallet.address}
            </p>
          </div>
          <button
            type="button"
            onClick={disconnect}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-slide-up space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {WALLETS.map((option) => (
          <button
            key={option.kind}
            type="button"
            disabled={connecting}
            onClick={() => connect(option.kind).catch(() => undefined)}
            className={`group rounded-2xl border px-4 py-4 text-left transition hover:border-violet-500/50 hover:bg-white/10 disabled:opacity-60 ${
              option.priority
                ? "border-violet-500/40 bg-gradient-to-br from-violet-600/20 to-indigo-600/10"
                : "border-white/10 bg-white/5"
            }`}
          >
            <div className="font-[family-name:var(--font-display)] text-base font-semibold text-white">
              {option.name}
            </div>
            <div className="mt-1 text-sm text-slate-400">{option.blurb}</div>
          </button>
        ))}
      </div>

      {signRequest && <SignPrompt request={signRequest} />}

      {error && (
        <p className="text-sm text-rose-300" role="alert">
          {error}
        </p>
      )}
      {connecting && !signRequest && (
        <p className="text-sm text-slate-400">Waiting for your wallet…</p>
      )}
    </div>
  );
}

export function SignPrompt({ request }: { request: SignRequest }) {
  if (request.wcUri) {
    return (
      <div className="space-y-3 rounded-2xl border border-violet-500/30 bg-violet-950/40 p-5 text-center">
        <p className="text-sm text-violet-200">
          Open Bifrost and approve this WalletConnect request
        </p>
        <p className="break-all rounded-xl bg-slate-950/60 p-3 text-left font-mono text-xs text-slate-300">
          {request.wcUri}
        </p>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(request.wcUri ?? "")}
          className="text-sm font-semibold text-violet-300 underline"
        >
          Copy request link
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-violet-500/30 bg-violet-950/40 p-5 text-center">
      <p className="text-sm text-violet-200">
        Scan with Xaman, or open the app on this device
      </p>
      {request.qrPng && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={request.qrPng}
          alt="Xaman sign request QR code"
          className="mx-auto h-44 w-44 rounded-xl bg-white p-2"
        />
      )}
      {request.deeplink && (
        <a
          href={request.deeplink}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-sm font-semibold text-violet-300 underline"
        >
          Open in Xaman
        </a>
      )}
    </div>
  );
}

function labelFor(kind: WalletKind): string {
  return WALLETS.find((w) => w.kind === kind)?.name ?? kind;
}
