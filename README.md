# VRTY Claim Portal

Standalone open-source claim app for **58.9 VRTY** per eligible XRPL wallet (first 10,000 claims).

**Author:** Verity Protocol  
**License:** MIT — see [LICENSE](./LICENSE)

## Status

🚧 **Phase 1 in development** — repository scaffold only. See [docs/PLAN.md](./docs/PLAN.md) for the approved specification.

## Eligibility (summary)

| Rule | Value |
|------|-------|
| Claim amount | 58.9 VRTY |
| Global cap | 10,000 successful claims (FCFS) |
| XRP balance | ≥ 10 XRP held continuously for 7 days |
| Per wallet | One successful claim |
| Per IP | One successful claim |
| Anti-sybil | Funding-parent / sibling detection, captcha, rate limits |

## Stack (planned)

- **Frontend:** Next.js, TypeScript, Tailwind (Verity visual design)
- **Wallets:** Xaman (xApp), GemWallet, Crossmark, Bifrost / WalletConnect
- **Backend:** Next.js API routes, PostgreSQL, XRPL.js
- **Deploy:** `claim.verityprotocol.io` (target)

## Quick start

Not yet — implementation starts after repo bootstrap. When ready:

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Related projects

- [Verity Protocol](https://github.com/SMMM25/Verity-Protocol-VRTY-) — main platform (separate codebase)
- Wallet connect reference: [Aaditya-T/xrpl-wallet-connect](https://github.com/Aaditya-T/xrpl-wallet-connect) (patterns only; see [NOTICE](./NOTICE))

## Security

Do not commit `.env` files or distribution wallet seeds. The distribution hot wallet must be funded separately before launch.
