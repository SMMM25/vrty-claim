import type { TransactionMetadata } from "xrpl";
import { dropsToXrp } from "./xrpl";

/**
 * `account_tx` entries differ between rippled API v1 and v2:
 * v1 exposes `tx`, v2 exposes `tx_json` plus a top-level `close_time_iso`.
 * xrpl.js defaults to v2, so read both shapes rather than pinning a version.
 */
export type NormalizedTx = {
  ms: number | null;
  fields: Record<string, unknown>;
  meta: TransactionMetadata | null;
};

type RawEntry = {
  tx?: unknown;
  tx_json?: unknown;
  meta?: unknown;
  metaData?: unknown;
  close_time_iso?: unknown;
};

/** XRPL timestamps are seconds since 2000-01-01. */
export function rippleTimeToMs(rippleTime: number): number {
  return (rippleTime + 946_684_800) * 1000;
}

export function normalizeTxEntry(entry: unknown): NormalizedTx | null {
  if (!entry || typeof entry !== "object") return null;
  const raw = entry as RawEntry;

  const candidate = raw.tx_json ?? raw.tx;
  if (!candidate || typeof candidate !== "object") return null;
  const fields = candidate as Record<string, unknown>;

  const rawMeta = raw.meta ?? raw.metaData;
  const meta =
    rawMeta && typeof rawMeta === "object"
      ? (rawMeta as TransactionMetadata)
      : null;

  return { ms: resolveMs(raw, fields), fields, meta };
}

function resolveMs(
  raw: RawEntry,
  fields: Record<string, unknown>
): number | null {
  if (typeof raw.close_time_iso === "string") {
    const parsed = Date.parse(raw.close_time_iso);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const date = fields.date;
  if (typeof date === "number") return rippleTimeToMs(date);
  return null;
}

type MetaNode = {
  LedgerEntryType?: string;
  FinalFields?: Record<string, unknown>;
  NewFields?: Record<string, unknown>;
};

function affectedNodes(meta: TransactionMetadata | null): {
  created: MetaNode | undefined;
  node: MetaNode | undefined;
}[] {
  const nodes = (meta as { AffectedNodes?: unknown } | null)?.AffectedNodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.map((entry) => {
    const wrapper = entry as Record<string, MetaNode | undefined>;
    const created = wrapper.CreatedNode;
    return {
      created,
      node: created ?? wrapper.ModifiedNode ?? wrapper.DeletedNode,
    };
  });
}

/** XRP balance (in XRP) of `address` after this transaction, if it was touched. */
export function accountRootBalanceAfter(
  meta: TransactionMetadata | null,
  address: string
): number | null {
  for (const { node } of affectedNodes(meta)) {
    if (!node || node.LedgerEntryType !== "AccountRoot") continue;
    const fields = node.FinalFields ?? node.NewFields;
    if (!fields || fields.Account !== address) continue;
    if (typeof fields.Balance === "string") return dropsToXrp(fields.Balance);
  }
  return null;
}

/** True when this transaction created `address` on the ledger. */
export function createdAccountRoot(
  meta: TransactionMetadata | null,
  address: string
): boolean {
  for (const { created } of affectedNodes(meta)) {
    if (!created || created.LedgerEntryType !== "AccountRoot") continue;
    if (created.NewFields?.Account === address) return true;
  }
  return false;
}
