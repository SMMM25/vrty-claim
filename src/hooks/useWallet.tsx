"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isAddressLike } from "@/lib/config";

export type WalletKind = "xaman" | "gemwallet" | "crossmark" | "bifrost";

export type ConnectedWallet = {
  kind: WalletKind;
  address: string;
};

/** Out-of-band signing prompt: Xaman QR/deeplink or a WalletConnect URI. */
export type SignRequest = {
  uuid?: string;
  qrPng?: string;
  deeplink?: string;
  wcUri?: string;
};

type WalletConnectClient = {
  request: (params: {
    topic: string;
    chainId: string;
    request: { method: string; params: Record<string, unknown> };
  }) => Promise<unknown>;
};

type WalletContextValue = {
  wallet: ConnectedWallet | null;
  connecting: boolean;
  error: string | null;
  connect: (kind: WalletKind) => Promise<void>;
  disconnect: () => void;
  signTrustSet: () => Promise<{ ok: boolean; error?: string }>;
  signRequest: SignRequest | null;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const SESSION_KEY = "vrty_claim_wallet";
const WC_TOPIC_KEY = "vrty_claim_wc_topic";
const XRPL_CHAIN = "xrpl:0";

function loadSession(): ConnectedWallet | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConnectedWallet;
    return isAddressLike(parsed?.address ?? "") ? parsed : null;
  } catch {
    return null;
  }
}

function saveSession(wallet: ConnectedWallet | null) {
  if (typeof window === "undefined") return;
  try {
    if (!wallet) sessionStorage.removeItem(SESSION_KEY);
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(wallet));
  } catch {
    /* private browsing — session lasts for this page view only */
  }
}

async function pollXamanPayload(uuid: string): Promise<string> {
  const deadline = Date.now() + 5 * 60_000;
  let polls = 0;

  while (Date.now() < deadline) {
    const res = await fetch(`/api/xumm/payload/${uuid}`);
    if (!res.ok) throw new Error("Lost contact with Xaman");
    const data = await res.json();

    if (data.meta?.resolved) {
      if (!data.meta.signed) throw new Error("The Xaman request was rejected");
      const address =
        data.response?.account ?? data.response?.signer ?? data.response?.address;
      if (typeof address === "string" && isAddressLike(address)) return address;
      throw new Error("Xaman signed without returning an account");
    }

    polls += 1;
    // Xaman rate limits payload lookups, so widen the gap the longer a request
    // stays unsigned. Early polls stay short because most users sign quickly.
    const delayMs = Math.min(5_000, 1_500 + polls * 500);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("Timed out waiting for Xaman");
}

function extractWcAddress(session: {
  namespaces?: Record<string, { accounts?: string[] }>;
}): string {
  const accounts = Object.values(session.namespaces ?? {}).flatMap(
    (namespace) => namespace.accounts ?? []
  );
  for (const account of accounts) {
    const address = account.split(":").pop() ?? "";
    if (isAddressLike(address)) return address;
  }
  throw new Error("The wallet did not share an XRPL address");
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(loadSession);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signRequest, setSignRequest] = useState<SignRequest | null>(null);
  const [wcClient, setWcClient] = useState<WalletConnectClient | null>(null);

  const disconnect = useCallback(() => {
    setWallet(null);
    saveSession(null);
    setSignRequest(null);
    setError(null);
    try {
      sessionStorage.removeItem(WC_TOPIC_KEY);
    } catch {
      /* nothing to clear */
    }
  }, []);

  const adopt = useCallback((kind: WalletKind, address: string) => {
    if (!isAddressLike(address)) {
      throw new Error("The wallet returned an invalid XRPL address");
    }
    const next = { kind, address };
    setWallet(next);
    saveSession(next);
    setSignRequest(null);
  }, []);

  const connect = useCallback(
    async (kind: WalletKind) => {
      setConnecting(true);
      setError(null);
      setSignRequest(null);
      try {
        if (kind === "xaman") {
          const res = await fetch("/api/xumm/signin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ returnUrl: window.location.href }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Xaman sign-in failed");

          setSignRequest({
            uuid: data.uuid,
            qrPng: data.refs?.qr_png,
            deeplink: data.refs?.deep_link_web ?? data.refs?.deeplink,
          });

          adopt(kind, await pollXamanPayload(data.uuid));
          return;
        }

        if (kind === "gemwallet") {
          const api = await import("@gemwallet/api");
          const installed = await api.isInstalled();
          if (!installed.result?.isInstalled) {
            throw new Error("The GemWallet extension is not installed");
          }
          const addr = await api.getAddress();
          if (addr.type !== "response" || !addr.result?.address) {
            throw new Error("GemWallet did not share an address");
          }
          adopt(kind, addr.result.address);
          return;
        }

        if (kind === "crossmark") {
          const { default: sdk } = await import("@crossmarkio/sdk");
          const detected = await sdk.async.detect(3000);
          if (!detected) {
            throw new Error("The Crossmark extension was not detected");
          }
          await sdk.async.signInAndWait();
          const address = sdk.session.address ?? sdk.sync.getAddress();
          if (!address) throw new Error("Crossmark did not share an address");
          adopt(kind, address);
          return;
        }

        const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
        if (!projectId) {
          throw new Error(
            "WalletConnect is not configured for this deployment yet"
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
            url: window.location.origin,
            icons: [`${window.location.origin}/icon-512.svg`],
          },
        });
        setWcClient(client);

        const { uri, approval } = await client.connect({
          requiredNamespaces: {
            xrpl: {
              methods: ["xrpl_signTransaction"],
              chains: [XRPL_CHAIN],
              events: [],
            },
          },
        });
        if (uri) setSignRequest({ wcUri: uri });

        const session = await approval();
        try {
          sessionStorage.setItem(WC_TOPIC_KEY, session.topic);
        } catch {
          /* session held in memory only */
        }
        adopt(kind, extractWcAddress(session));
      } catch (err) {
        setSignRequest(null);
        setError(err instanceof Error ? err.message : "Connection failed");
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [adopt]
  );

  const signTrustSet = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    if (!wallet) return { ok: false, error: "Connect a wallet first" };

    try {
      if (wallet.kind === "xaman") {
        const res = await fetch("/api/xumm/trustset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: wallet.address }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not reach Xaman");

        setSignRequest({
          uuid: data.uuid,
          qrPng: data.refs?.qr_png,
          deeplink: data.refs?.deep_link_web ?? data.refs?.deeplink,
        });

        await pollXamanPayload(data.uuid);
        return { ok: true };
      }

      const txRes = await fetch("/api/trustset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet.address }),
      });
      const txData = await txRes.json();
      if (!txRes.ok) throw new Error(txData.error || "Could not build TrustSet");

      if (wallet.kind === "gemwallet") {
        const api = await import("@gemwallet/api");
        const result = await api.submitTransaction({
          transaction: txData.txJson,
        });
        if (result.type !== "response") {
          throw new Error("GemWallet declined the trust line");
        }
        return { ok: true };
      }

      if (wallet.kind === "crossmark") {
        const { default: sdk } = await import("@crossmarkio/sdk");
        const result = await sdk.async.signAndSubmitAndWait(txData.txJson);
        const status = (
          result as {
            response?: {
              data?: { meta?: { isRejected?: boolean; isSuccess?: boolean } };
            };
          }
        ).response?.data?.meta;
        if (status?.isRejected || status?.isSuccess === false) {
          throw new Error("Crossmark declined the trust line");
        }
        return { ok: true };
      }

      const topic = sessionStorage.getItem(WC_TOPIC_KEY);
      if (!topic || !wcClient) {
        throw new Error("The WalletConnect session expired — reconnect Bifrost");
      }
      await wcClient.request({
        topic,
        chainId: XRPL_CHAIN,
        request: {
          method: "xrpl_signTransaction",
          params: { tx_json: txData.txJson, autofill: true, submit: true },
        },
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "The trust line failed",
      };
    } finally {
      setSignRequest(null);
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
      signRequest,
    }),
    [wallet, connecting, error, connect, disconnect, signTrustSet, signRequest]
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
