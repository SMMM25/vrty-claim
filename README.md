# VRTY Claim Portal

Standalone open-source claim app for **58.9 VRTY** per eligible XRPL wallet (first 10,000 claims).

**Author:** Scott Medeiros  
**License:** MIT — see [LICENSE](./LICENSE)

## Status

Phase 1 implemented — see [docs/PLAN.md](./docs/PLAN.md). Deploy notes: [docs/DEPLOY.md](./docs/DEPLOY.md).

## Eligibility

| Rule | Value |
|------|-------|
| Claim amount | 58.9 VRTY |
| Global cap | 10,000 successful claims (FCFS) |
| XRP balance | ≥ 10 XRP held continuously for 7 days |
| Per wallet | One successful claim |
| Per IP | One successful claim |
| Anti-sybil | Funding-parent / sibling detection, captcha, rate limits |

## Stack

- **Frontend:** Next.js 15, TypeScript, Tailwind (Verity visual design)
- **Wallets:** Xaman (xApp), GemWallet, Crossmark, Bifrost / WalletConnect
- **Backend:** Next.js API routes, PostgreSQL (Prisma), XRPL.js
- **Deploy target:** `claim.verityprotocol.io`

## Quick start

```bash
cp .env.example .env.local
# fill DATABASE_URL, DISTRIBUTION_SEED, Xaman + Turnstile keys
npm install
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/status` | Cap progress + config health |
| POST | `/api/eligibility` | `{ walletAddress }` → eligibility report |
| POST | `/api/claim` | Atomic claim + distribution Payment |
| POST | `/api/trustset` | Unsigned TrustSet txjson |
| POST | `/api/xumm/signin` | Xaman SignIn payload |
| POST | `/api/xumm/trustset` | Xaman TrustSet payload |
| GET | `/api/xumm/payload/:uuid` | Poll Xaman result |

## Security

Do not commit `.env` files or distribution wallet seeds. The distribution hot wallet must be funded (~589k VRTY + XRP fees) before launch.

## Related

- [Verity Protocol](https://github.com/SMMM25/Verity-Protocol-VRTY-) — main platform (separate codebase)
- Wallet connect reference: [Aaditya-T/xrpl-wallet-connect](https://github.com/Aaditya-T/xrpl-wallet-connect) (patterns only; see [NOTICE](./NOTICE))
