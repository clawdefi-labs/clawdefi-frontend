# ClawDeFi Frontend (`clawdefi-frontend`)

Landing and install surface for the ClawDeFi agentic DeFi stack.

## Security Baseline (Next.js CVE)
This repo is pinned to **`next@16.1.4`** and **`eslint-config-next@16.1.4`**, on a patched release line after the middleware authorization bypass disclosure from December 2025.

Pinning policy for now:
- Use exact versions (no caret ranges) for `next` and `eslint-config-next`.
- Upgrade only to a verified patched release line.
- Run `pnpm build` and auth-flow regression checks before every dependency bump.

## Frontend Sections (v1 scaffold)
- Signal-heavy hero with interactive binary displacement canvas.
- Install panel with ClawHub and Raw modes (copy-friendly commands).
- Runtime flow cards for signer checks, deterministic intelligence, and safety gates.
- Data-core cards for protocol registry, curated vaults, and strategy layers.
- Module matrix for active and next-phase modules.
- Policy and trust band with direct `/skill.md` entrypoint.

## Frontend Architecture
- Next.js App Router + TypeScript
- Static-first landing UI with interactive client components
- Synced skill artifacts published under `/skills/clawdefi-agent/*`
- Environment-configurable skill base URL for manifest and embedded instructions

## Quick Start
```bash
cd /Users/alvinyap/Desktop/code/work/alphaclaw/frontend
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
- default public base is `https://www.clawdefi.ai/skills/clawdefi-agent`,
- to force preview-based URLs in non-production testing, set `SKILL_USE_VERCEL_URL=1`,
- `SKILL_DISABLE_LOCAL=1` (force remote source only, useful in CI),
- `SKILL_SYNC_STRICT=1` (fail build if sync source cannot be fetched).
