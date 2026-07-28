"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type WalletKind = "xaman" | "gemwallet" | "crossmark" | "bifrost";

export type ConnectedWallet = {
  kind: WalletKind;
  address: string;
};

type XamanRefs = {
  qrPng?: string;
  deeplink?: string;
  uuid?: string;
  /** WalletConnect pairing URI for Bifrost */
  wcUri?: string;
};

type WalletContextValue = {
  wallet: ConnectedWallet | null;
  connecting: boolean;
  error: string | null;
  connect: (kind: WalletKind) => Promise<void>;
  disconnect: () => void;
  signTrustSet: () => Promise<{ ok: boolean; error?: string }>;
  xamanRefs: XamanRefs | null;
  clearXamanRefs: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const SESSION_KEY = "vrty_claim_wallet";
const WC_TOPIC_KEY = "vrty_claim_wc_topic";

function loadSession(): ConnectedWallet | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConnectedWallet;
  } catch {
    return null;
  }
}

function saveSession(wallet: ConnectedWallet | null) {
  if (typeof window === "undefined") return;
  if (!wallet) {
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(wallet));
}

async function pollXamanPayload(uuid: string): Promise<string> {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const res = await fetch(`/api/xumm/payload/${uuid}`);
    if (!res.ok) throw new Error("Failed to poll Xaman payload");
    const data = await res.json();
    if (data.meta?.resolved && data.meta?.signed) {
      const address =
        data.response?.account || data.response?.signer || data.response?.address;
      if (typeof address === "string") return address;
      throw new Error("Xaman signed but no account returned");
    }
    if (data.meta?.resolved && !data.meta?.signed) {
      throw new Error("Xaman request was rejected");
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Timed out waiting for Xaman");
}

function extractWcAddress(session: {
  namespaces?: Record<string, { accounts?: string[] }>;
}): string {
  const accounts =
    session.namespaces?.xrpl?.accounts ??
    session.namespaces?.xrplmainnet?.accounts ??
    Object.values(session.namespaces ?? {}).flatMap((n) => n.accounts ?? []);
  const first = accounts[0];
  if (!first) throw new Error("WalletConnect session has no account");
  // format: xrpl:0:rXXXX or eip155:1:0x...
  const parts = first.split(":");
  const address = parts[parts.length - 1];
  if (!address?.startsWith("r")) {
    throw new Error("Connected wallet did not return an XRPL address");
  }
  return address;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(() => loadSession());
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [xamanRefs, setXamanRefs] = useState<XamanRefs | null>(null);
  const [wcClient, setWcClient] = useState<{
    request: (params: {
      topic: string;
      chainId: string;
      request: {
        method: string;
        params: Record<string, unknown>;
      };
    }) => Promise<unknown>;
  } | null>(null);

  const disconnect = useCallback(() => {
    setWallet(null);
    saveSession(null);
    setXamanRefs(null);
    setError(null);
    try {
      sessionStorage.removeItem(WC_TOPIC_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const clearXamanRefs = useCallback(() => setXamanRefs(null), []);

  const connect = useCallback(async (kind: WalletKind) => {
    setConnecting(true);
    setError(null);
    setXamanRefs(null);
    try {
      if (kind === "xaman") {
        const res = await fetch("/api/xumm/signin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            returnUrl:
              typeof window !== "undefined" ? window.location.href : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Xaman SignIn failed");

        setXamanRefs({
          uuid: data.uuid,
          qrPng: data.refs?.qr_png,
          deeplink: data.refs?.deep_link_web || data.refs?.deeplink,
        });

        const address = await pollXamanPayload(data.uuid);
        const next = { kind, address };
        setWallet(next);
        saveSession(next);
        setXamanRefs(null);
        return;
      }

      if (kind === "gemwallet") {
        const api = await import("@gemwallet/api");
        const installed = await api.isInstalled();
        if (!installed.result?.isInstalled) {
          throw new Error("GemWallet extension is not installed");
        }
        const addr = await api.getAddress();
        if (addr.type !== "response" || !addr.result?.address) {
          throw new Error("GemWallet did not return an address");
        }
        const next = { kind, address: addr.result.address };
        setWallet(next);
        saveSession(next);
        return;
      }

      if (kind === "crossmark") {
        const mod = await import("@crossmarkio/sdk");
        const sdk = mod.default;
        const detected = await sdk.async.detect(3000);
        if (!detected) {
          throw new Error("Crossmark extension not detected");
        }
        await sdk.async.signInAndWait();
        const address = sdk.session.address || sdk.sync.getAddress();
        if (!address) {
          throw new Error("Crossmark did not return an address");
        }
        const next = { kind, address };
        setWallet(next);
        saveSession(next);
        return;
      }

      if (kind === "bifrost") {
        const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
        if (!projectId) {
          throw new Error(
            "WalletConnect is not configured. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID."
          );
        }

        const { default: SignClient } = await import(
          "@walletconnect/sign-client"
        );
        const client = await SignClient.init({
          projectId,
          metadata: {
            name: "VRTY Claim",
            description: "Verity Protocol VRTY claim portal",
            url:
              typeof window !== "undefined"
                ? window.location.origin
                : "https://claim.verityprotocol.io",
            icons: ["https://claim.verityprotocol.io/icon-512.svg"],
          },
        });
        setWcClient(client);

        const { uri, approval } = await client.connect({
          requiredNamespaces: {
            xrpl: {
              methods: ["xrpl_signTransaction"],
              chains: ["xrpl:0"],
              events: [],
            },
          },
        });

        if (uri) {
          setXamanRefs({ wcUri: uri });
        }

        const session = await approval();
        try {
          sessionStorage.setItem(WC_TOPIC_KEY, session.topic);
        } catch {
          /* ignore */
        }

        const address = extractWcAddress(session);
        const next = { kind, address };
        setWallet(next);
        saveSession(next);
        setXamanRefs(null);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

  const signTrustSet = useCallback(async () => {
    if (!wallet) return { ok: false, error: "No wallet connected" };

    try {
      if (wallet.kind === "xaman") {
        const res = await fetch("/api/xumm/trustset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: wallet.address }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "TrustSet payload failed");

        setXamanRefs({
          uuid: data.uuid,
          qrPng: data.refs?.qr_png,
          deeplink: data.refs?.deep_link_web || data.refs?.deeplink,
        });

        await pollXamanPayload(data.uuid);
        setXamanRefs(null);
        return { ok: true };
      }

      const txRes = await fetch("/api/trustset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet.address }),
      });
      const txData = await txRes.json();
      if (!txRes.ok) throw new Error(txData.error || "Failed to build TrustSet");

      if (wallet.kind === "gemwallet") {
        const api = await import("@gemwallet/api");
        const result = await api.submitTransaction({ transaction: txData.txJson });
        if (result.type !== "response") {
          throw new Error("GemWallet rejected TrustSet");
        }
        return { ok: true };
      }

      if (wallet.kind === "crossmark") {
        const mod = await import("@crossmarkio/sdk");
        const sdk = mod.default;
        await sdk.async.signAndSubmitAndWait(txData.txJson);
        return { ok: true };
      }

      if (wallet.kind === "bifrost") {
        const topic =
          typeof window !== "undefined"
            ? sessionStorage.getItem(WC_TOPIC_KEY)
            : null;
        if (!topic || !wcClient) {
          throw new Error("WalletConnect session expired — reconnect Bifrost");
        }
        await wcClient.request({
          topic,
          chainId: "xrpl:0",
          request: {
            method: "xrpl_signTransaction",
            params: {
              tx_json: txData.txJson,
              autopilot: true,
            },
          },
        });
        return { ok: true };
      }

      return { ok: false, error: "Wallet cannot sign TrustSet yet" };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "TrustSet failed",
      };
    }
  }, [wallet, wcClient]);

  const value = useMemo(
    () => ({
      wallet,
      connecting,
      error,
      connect,
      disconnect,
      signTrustSet,
      xamanRefs,
      clearXamanRefs,
    }),
    [
      wallet,
      connecting,
      error,
      connect,
      disconnect,
      signTrustSet,
      xamanRefs,
      clearXamanRefs,
    ]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
