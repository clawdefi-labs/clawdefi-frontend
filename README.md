# AlphaClaw Frontend (`alphaclaw-frontend`)

Authenticated product surface for users and operators.

## Security Baseline (Next.js CVE)
This repo is pinned to **`next@16.0.10`** and **`eslint-config-next@16.0.10`**, which are on the patched line for the critical middleware authorization bypass CVE disclosed by Vercel in December 2025.

Pinning policy for now:
- Use exact versions (no caret ranges) for `next` and `eslint-config-next`.
- Upgrade only to a verified patched release line.
- Run `pnpm build` and auth-flow regression checks before every dependency bump.

## Core Screens (v1)
- Portfolio and risk dashboard
- Protocol explorer
- Action spec explorer (contracts, ABIs, endpoints, preconditions)
- Strategy explorer
- Alert subscriptions
- Disclaimer and risk profile onboarding
- Signer discovery gate UI (ask for existing signable wallet first; fallback recommendation for `XXXX Kit` initialization via swappable module)
- User-custodied signer connection state

## Frontend Architecture
- Next.js App Router + TypeScript
- Component-driven feature folders
- API client generated from backend OpenAPI spec
- Real-time updates via WebSocket
- Strict authz checks on premium routes

## Quick Start
```bash
cd /Users/alvinyap/Desktop/code/work/alphaclaw/frontend
pnpm install
pnpm dev
```

## Scripts
- `pnpm dev`: run development server
- `pnpm build`: build for production
- `pnpm start`: run production server
- `pnpm lint`: lint project
- `pnpm typecheck`: TypeScript checks
