# Radix Vaults

Monorepo scaffold for the multisig vaults project.

## Included in current slices

- `apps/client` TanStack Start SPA
- `apps/server` Node.js Effect RPC server (`/rpc`)
- `packages/shared` typed RPC contract
- `packages/database` Drizzle schema + migration workflow
- Husky + lint-staged + lint/test/typecheck scripts
- Public vault reads:
  - `/` dashboard with vault list + pending proposal counts
  - `/vaults/$vaultId` detail with balance + signer threshold view

## Prerequisites

- Node.js 22+
- pnpm 10+
- Docker (for local Postgres)

## Quickstart

```bash
pnpm install
pnpm dev:db
cp .env.example .env
pnpm db:migrate
pnpm dev
```

- Client runs on `http://localhost:3000`
- Server runs on `http://localhost:3001`
- Client calls server via `/rpc` proxy in Vite dev server.
- By default, server seeds two demo vaults for the public read tracer bullet (`TRACER_BULLET_SEED=true`).

## Quality gates

```bash
pnpm fmt:check
pnpm lint
pnpm test
pnpm check-types
```

## Database workflow

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```
