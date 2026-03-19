# Radix Vaults

**Multisig vaults for Radix.**

A full-stack TypeScript application for creating and managing multi-signature accounts on the Radix network. Define signer sets, propose transactions, collect approvals via wallet pre-authorization, and submit — all through a clean web interface backed by on-chain verification.

## Features

### Core

- **Vault creation and import** — create new on-chain multisig accounts or import existing ones with CountOf/AllOf access rules
- **Proposal lifecycle** — create transaction proposals, collect threshold signatures, submit to network
- **Threshold signing** — each vault defines its own signer set and approval threshold
- **Team management** — add/remove members, change thresholds via team proposals
- **Badge-gated writes** — soul-bound **non-fungible tokens (NFTs)** control write access independent of vault signer sets

### Radix

- **ROLA authentication** — challenge-response login via Radix Wallet (dApp Toolkit), with on-ledger `owner_keys` verification
- **Subintent signing** — signers approve via wallet pre-authorization; server recomposes with fee payer for submission
- **On-chain state sync** — re-sync vault signers, balances, and access rules from Gateway
- **Proposal invalidation** — automatic detection of signer/threshold drift and preview failures

### Developer Experience

- **Effect throughout** — server runtime, HTTP API, error handling, dependency injection, and client state all use Effect
- **Type-safe API** — shared HTTP API contract between client and server via `@effect/platform` HttpApi
- **CLI bootstrap** — one-time setup tool to create team accounts and mint initial NFT badges with member metadata
- **E2E tests** — Playwright against Stokenet with TestContainers for isolated DB

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Vault** | On-chain Radix account with a multisig owner-role (CountOf or AllOf). Each vault has its own signer set and approval threshold. |
| **Proposal** | Transaction manifest submitted for approval. Lifecycle: Created, Signing, Ready, Submitted, then Committed, Failed, Expired, or Invalid. |
| **Signature** | Cryptographic approval on a proposal's subintent, collected via wallet pre-authorization and validated against the vault's current access rule. |
| **Subintent** | Partial transaction targeting a proposal. Signers approve via wallet pre-authorization. Once threshold is met, server recomposes with fee payer and submits. |
| **Team** | Separate on-chain account for badge operations (mint, recall, burn). Controls write access to the app, not vault funds. |
| **Badge** | Soul-bound NFT minted per team member. Each badge carries metadata (name, key type, local ID derived from public key). Grants write access independent from vault signer sets. |
| **ROLA** | Radix Off-Ledger Authentication. Challenge-response protocol: server issues one-time challenge, wallet signs, server verifies signature and confirms signing public key matches the claimed address via on-ledger `owner_keys` metadata. |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TanStack Start/Router, Tailwind CSS 4, Effect Atom |
| Backend | Effect 3, `@effect/platform` HttpApi |
| Database | PostgreSQL 17, Drizzle ORM, `@effect/sql` |
| DLT | Radix Gateway API, Radix Engine Toolkit, dApp Toolkit, `sbor-ez-mode` |
| Crypto | `@noble/curves`, `@noble/hashes` (ROLA verification) |
| Build | pnpm 10, Turborepo, Vite 7, TypeScript 5.9 |
| Quality | oxlint, oxfmt, Vitest, Playwright, Husky + lint-staged |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Client                           │
│          React / TanStack Start / Effect Atom           │
│                    localhost:3000                        │
└────────────────────────┬────────────────────────────────┘
                         │ HttpApiClient
┌────────────────────────▼────────────────────────────────┐
│                        Server                           │
│              Effect Runtime / HttpApi                    │
│                    localhost:3001                        │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Auth     │  │ Handlers     │  │ Gateway           │ │
│  │ (ROLA)   │  │ (Vaults,     │  │ (Radix Network,   │ │
│  │          │  │  Proposals,  │  │  Tx Submission,   │ │
│  │          │  │  Team)       │  │  Access Rules)    │ │
│  └────┬─────┘  └──────┬───────┘  └───────────────────┘ │
│       │               │                                 │
│  ┌────▼───────────────▼──┐                              │
│  │ PostgreSQL (Drizzle)  │                              │
│  │ Vaults, Proposals,    │                              │
│  │ Signatures, Sessions  │                              │
│  └───────────────────────┘                              │
└─────────────────────────────────────────────────────────┘
```

## Quickstart

**Prerequisites:** Node.js 22+, pnpm 10+, Docker. Recommended: [direnv](https://direnv.net/) for automatic env var loading.


### Generate Fee Payer

Rust CLI that generates an Ed25519 keypair for paying transaction fees. On Stokenet it can also fund the account from the faucet. Requires Rust toolchain.

```bash
cd generate-fee-payer-cli
cargo run                      # Interactive: pick network, optionally fund from faucet
```

Add the printed `FEE_PAYER_PRIVATE_KEY_HEX` to your `.envrc` / `.env`.

### Bootstrap CLI

One-time setup to create on-chain team infrastructure before the web app can operate. Requires `FEE_PAYER_PRIVATE_KEY_HEX` in environment.

```bash
pnpm bootstrap init            # Interactive config -> bootstrap.json
pnpm bootstrap run             # Create team account + mint badges
```

### Run development servers

```bash
pnpm install
pnpm dev:db                        # Start Postgres container
pnpm db:migrate                    # Apply schema migrations
pnpm dev                           # Start client + server
```

Client: `http://localhost:3000` | Server: `http://localhost:3001`


## Project Structure

```
apps/
  client/                      # TanStack Start SPA
    src/
      routes/                  # File-based routing
      services/                # API clients
      atom/                    # Effect atom state
      components/              # Shared UI
  server/                      # Effect HttpApi server
    src/
      api/                     # HTTP endpoint handlers
      handlers/                # Business logic services
      gateway/                 # Radix Gateway integration
      auth/                    # ROLA, sessions, badge checks
      db/                      # PostgreSQL client setup
  cli/                         # Bootstrap CLI tool
    src/
      commands/                # init, run subcommands

packages/
  shared/                      # API contract, schemas, domain types
    src/
      api/                     # HttpApi endpoint definitions
  database/                    # Drizzle schema + migrations
    src/
      schema.ts
      drizzle/                 # Generated migrations
```

## Development

### Quality Gates

```bash
pnpm lint-staged
pnpm check-types
pnpm test
pnpm build
```

Lint, typecheck, test, build run on pre-commit via Husky.

### Database

```bash
pnpm dev:db                    # Start Postgres (Docker)
pnpm db:generate               # Generate migration from schema changes
pnpm db:migrate                # Apply pending migrations
pnpm db:studio                 # Open Drizzle Studio
```

### Environment Variables

**Server** (`apps/server/.env`):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Postgres connection string | `postgres://postgres:postgres@localhost:5433/radix_vaults` |
| `DATABASE_SSL` | TLS for DB connection | `false` |
| `SERVER_PORT` | Listen port | `3001` |
| `NETWORK_ID` | Radix network (1 = Mainnet, 2 = Stokenet) | `2` |
| `DAPP_DEFINITION_ADDRESS` | dApp metadata account address | — |
| `EXPECTED_ORIGIN` | ROLA origin validation | `http://localhost:3000` |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) | `http://localhost:3000` |
| `LOG_LEVEL` | Logger verbosity | `Info` |
| `LOG_FORMAT` | Logger format (`pretty` or `json`) | `pretty` |

**Client** (`apps/client/.env`):

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Server URL | `http://localhost:3001` |
| `VITE_ENV` | Environment (`dev`, `staging`, `prod`, `local`) | `prod` |
| `VITE_DAPP_DEFINITION_ADDRESS` | dApp definition account address | Stokenet default |
| `VITE_NETWORK_ID` | Radix network ID (1 = Mainnet, 2 = Stokenet) | `2` |

