# ClawDeFi Frontend (`clawdefi-frontend`)

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
cd /Users/alvinyap/Desktop/code/work/clawdefi/frontend
pnpm install
pnpm dev
```

## Scripts
- `pnpm dev`: run development server
- `pnpm sync:skill`: sync `SKILL.md` + runtime scripts into frontend public hosting paths
- `pnpm build`: build for production
- `pnpm start`: run production server
- `pnpm lint`: lint project
- `pnpm typecheck`: TypeScript checks

## Skill Distribution (ClawHub + Direct Domain)
Keep one source of truth:
- canonical skill source: `clawdefi-agent-skill` repository,
- frontend hosts a synced static mirror for direct install and discovery.

Published paths:
- `/skill.md` (human/agent discovery path, similar to `moltbook.com/skill.md`),
- `/skills/clawdefi-agent/SKILL.md`,
- `/skills/clawdefi-agent/manifest.json`,
- `/skills/clawdefi-agent/scripts/*` (all required runtime scripts).

Build behavior:
- `pnpm build` runs `pnpm sync:skill` first,
- sync source priority:
  1. local sibling path (`../skill`) when available in workspace,
  2. remote raw source (`https://raw.githubusercontent.com/clawdefi-labs/clawdefi-agent-skill/main`) as fallback.
- if source fetch fails in non-strict mode, build uses already-published `public/skills/*` artifacts.

Configurable environment variables:
- `SKILL_SOURCE_BASE_URL` (override remote skill source repo base URL),
- `SKILL_PUBLIC_BASE_URL` (base URL written into generated `manifest.json`; also rewrites legacy `skills.clawdefi.ai` links inside `SKILL.md` during sync),
- if `SKILL_PUBLIC_BASE_URL` is unset and `VERCEL_URL` exists, sync defaults to `https://$VERCEL_URL/skills/clawdefi-agent`,
- `SKILL_DISABLE_LOCAL=1` (force remote source only, useful in CI),
- `SKILL_SYNC_STRICT=1` (fail build if sync source cannot be fetched).
