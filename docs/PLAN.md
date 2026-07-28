# Phase 1 — Approved plan

This document captures the approved claim portal specification. Implementation follows this scope.

## Product

Separate open-source repository (this repo), submitted to Xaman as an xApp by Scott Medeiros (KYC). Visual design matches Verity Protocol; **no shared application code** with the main Verity monorepo.

## Claim rules

- **58.9 VRTY** per successful claim
- **Max 10,000** successful claims globally (first-come, first-served; no snapshot)
- Wallet must hold **≥ 10 XRP** continuously for **7 days** (dropping below 10 XRP resets the timer)
- **One claim per wallet**
- **One successful claim per IP address**
- Block wallets that share a funding parent or appear as siblings (anti-sybil)
- Captcha + rate limiting on public endpoints

## User flow

1. Connect wallet (Xaman xApp priority, or extension / WalletConnect)
2. If no VRTY trust line → user signs **TrustSet** (user pays reserve)
3. Backend verifies eligibility atomically (balance history, caps, sybil, IP)
4. Distribution wallet signs **Payment(58.9 VRTY)** to claimant
5. UI shows updated balance and confirmation

## Wallets (Phase 1)

| Wallet | Integration |
|--------|-------------|
| Xaman | xApp + xumm-sdk |
| GemWallet | @gemwallet/api |
| Crossmark | @crossmarkio/sdk |
| Bifrost | WalletConnect v2 |

## Backend components

- **PostgreSQL:** claims table, IP tracking, `funded_by` graph, global counter
- **Balance verifier:** XRPL ledger history — 7-day continuous ≥ 10 XRP
- **Hot wallet:** ~589k VRTY + XRP for fees; signs outbound payments only after DB lock
- **API:** eligibility check, claim submit, health/status

## Issuer reference

- VRTY issuer: `rBeHfq9vRjZ8Cth1sMbp2nJvExmxSxAH8f`

## Reuse strategy (not copy-paste)

Patterns adapted from Verity main repo and community references:

- Multi-wallet hook patterns (`useMultiWallet`, WalletConnect session)
- WalletConnect service patterns (pairing, sign request lifecycle)
- Tailwind theme: slate-950, violet/indigo gradients

New code (~50–60% of effort):

- 7-day balance history engine
- Anti-sybil / funding graph
- Claim API with atomic cap + idempotency
- Distribution signing pipeline
- xApp manifest and claim-specific UI

## Implementation notes

Decisions made while building Phase 1 that a reviewer should know:

- **API version safety.** `account_tx` returns `tx` on rippled API v1 and `tx_json` on v2 (the xrpl.js default). All ledger history is read through `src/lib/xrpl-tx.ts`, which normalises both shapes.
- **Provable history only.** The hold check requires history reaching past the window start, or the account-creating transaction. If neither is available the claim is refused rather than assumed — no silent passes.
- **Hold clock.** Balance between two observations equals the older observation, so history reduces to segments. The clock restarts at the end of the most recent segment below the minimum.
- **Cap accounting.** Reservations lock the counter row (`SELECT … FOR UPDATE`) and count `PENDING`, `SUBMITTED`, and `SUCCESS` claims, so concurrent requests cannot oversell the cap. Abandoned `PENDING` rows release their slot after 15 minutes.
- **No double payments.** The payment is signed, its hash and `LastLedgerSequence` are stored, and only then is it submitted. An interrupted run is reconciled from the ledger on the next attempt instead of paying again. A claim is only released for retry once the ledger proves the payment failed or expired.
- **One payment at a time.** `autofill` reads the distribution wallet's next sequence number from the ledger, so concurrent claims would sign duplicate sequences and stall until their ledger gap expired. Signing and submitting are serialised, which also means claims are processed in order.
- **Counter integrity.** The success transition is guarded, so the counter increments exactly once per claim even if finalisation runs twice.
- **Single instance.** Payment serialisation and rate limiting are both in-process, so the service runs with one replica (`numReplicas: 1`). Running replicas requires a shared lock for the distribution wallet and Redis-backed rate limiting.
- **Captcha fails closed.** In production a missing `TURNSTILE_SECRET_KEY` rejects claims rather than skipping the check.

## Deployment

- Target URL: `claim.verityprotocol.io`
- Postgres + env secrets on Railway or equivalent
- Turnstile (or similar) for captcha

## Out of scope (Phase 1)

- Integration with main Verity buy flow
- Snapshot-based airdrop
- Admin dashboard (optional later)
