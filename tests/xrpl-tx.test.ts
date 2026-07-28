import { describe, expect, it } from "vitest";
import {
  accountRootBalanceAfter,
  createdAccountRoot,
  normalizeTxEntry,
  rippleTimeToMs,
} from "@/lib/xrpl-tx";
import type { TransactionMetadata } from "xrpl";

const ADDRESS = "rBeHfq9vRjZ8Cth1sMbp2nJvExmxSxAH8f";

function meta(nodes: unknown[]): TransactionMetadata {
  return { AffectedNodes: nodes } as unknown as TransactionMetadata;
}

describe("normalizeTxEntry", () => {
  it("reads the API v2 shape (tx_json plus close_time_iso)", () => {
    const entry = normalizeTxEntry({
      tx_json: { TransactionType: "Payment", Account: ADDRESS },
      close_time_iso: "2026-07-20T10:00:00Z",
      meta: { AffectedNodes: [] },
    });

    expect(entry?.fields.TransactionType).toBe("Payment");
    expect(entry?.ms).toBe(Date.parse("2026-07-20T10:00:00Z"));
  });

  it("reads the API v1 shape (tx with a ripple-epoch date)", () => {
    const rippleDate = 800_000_000;
    const entry = normalizeTxEntry({
      tx: { TransactionType: "Payment", date: rippleDate },
      meta: { AffectedNodes: [] },
    });

    expect(entry?.ms).toBe(rippleTimeToMs(rippleDate));
  });

  it("falls back to metaData and reports a missing timestamp", () => {
    const entry = normalizeTxEntry({
      tx_json: { TransactionType: "TrustSet" },
      metaData: { AffectedNodes: [] },
    });

    expect(entry?.ms).toBeNull();
    expect(entry?.meta).not.toBeNull();
  });

  it("returns null when there is no transaction payload", () => {
    expect(normalizeTxEntry({ meta: {} })).toBeNull();
    expect(normalizeTxEntry(null)).toBeNull();
  });
});

describe("accountRootBalanceAfter", () => {
  it("reads the final balance from a modified account root", () => {
    const balance = accountRootBalanceAfter(
      meta([
        {
          ModifiedNode: {
            LedgerEntryType: "AccountRoot",
            FinalFields: { Account: ADDRESS, Balance: "12500000" },
          },
        },
      ]),
      ADDRESS
    );

    expect(balance).toBe(12.5);
  });

  it("reads the new balance from a created account root", () => {
    const balance = accountRootBalanceAfter(
      meta([
        {
          CreatedNode: {
            LedgerEntryType: "AccountRoot",
            NewFields: { Account: ADDRESS, Balance: "20000000" },
          },
        },
      ]),
      ADDRESS
    );

    expect(balance).toBe(20);
  });

  it("ignores account roots belonging to other wallets", () => {
    const balance = accountRootBalanceAfter(
      meta([
        {
          ModifiedNode: {
            LedgerEntryType: "AccountRoot",
            FinalFields: { Account: "rSomeoneElse", Balance: "99000000" },
          },
        },
        {
          ModifiedNode: {
            LedgerEntryType: "RippleState",
            FinalFields: { Account: ADDRESS, Balance: "5" },
          },
        },
      ]),
      ADDRESS
    );

    expect(balance).toBeNull();
  });
});

describe("createdAccountRoot", () => {
  it("detects the funding transaction that created the wallet", () => {
    const created = createdAccountRoot(
      meta([
        {
          CreatedNode: {
            LedgerEntryType: "AccountRoot",
            NewFields: { Account: ADDRESS, Balance: "20000000" },
          },
        },
      ]),
      ADDRESS
    );

    expect(created).toBe(true);
  });

  it("does not treat a modification as creation", () => {
    const created = createdAccountRoot(
      meta([
        {
          ModifiedNode: {
            LedgerEntryType: "AccountRoot",
            FinalFields: { Account: ADDRESS, Balance: "20000000" },
          },
        },
      ]),
      ADDRESS
    );

    expect(created).toBe(false);
  });
});
