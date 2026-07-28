# VRTY Claim — Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

## Required env

See `.env.example`. Minimum for a working deploy:

- `DATABASE_URL` — Postgres
- `DISTRIBUTION_SEED` — hot wallet classic seed (fund with ~589k VRTY + XRP fees)
- `NEXT_PUBLIC_XUMM_API_KEY` / `XUMM_API_SECRET` — Xaman
- `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — captcha (required in production)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — Bifrost / WalletConnect

## Build

Nixpacks runs `npm ci` automatically — do **not** repeat it in `buildCommand`
(that causes `EBUSY` on `node_modules/.cache` during Railway builds).

```
npm run build
```

Start: `npx prisma migrate deploy && npm start`

Custom domain: `claim.verityprotocol.io`
