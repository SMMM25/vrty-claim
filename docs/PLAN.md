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

## Deployment

- Target URL: `claim.verityprotocol.io`
- Postgres + env secrets on Railway or equivalent
- Turnstile (or similar) for captcha

## Out of scope (Phase 1)

- Integration with main Verity buy flow
- Snapshot-based airdrop
- Admin dashboard (optional later)
