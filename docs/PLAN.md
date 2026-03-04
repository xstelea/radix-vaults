# Implementation Plan: Multisig Vaults

## Overview

TypeScript Turbo+pnpm monorepo: Effect RPC server, TanStack Start SPA client, bootstrap CLI, shared schemas package. All vaults delegate auth to a single global superadmin multisig account. Badge-gated access — anyone holding a fungible ROLA badge can use the app. Superadmin threshold signing is the real authorization gate.

## Reference Repos

- **consultation_v2** — monorepo structure, Turbo/pnpm config, Drizzle ORM, Effect Layer composition, TanStack Start client
- **multisig** — proposal lifecycle, manifest builders, subintent signing, fee payer, access rule parsing, wallet integration

---

## Architecture

### Auth Model

All vaults' owner/auth roles delegate to one **global superadmin** multisig account. One signer set, one threshold for the entire system. Signers are fetched from Gateway (on-chain state), not stored per-vault.

**ROLA flow**: server generates a challenge (stored in `challenges` table, single-use), client signs with wallet, server verifies signature proves wallet ownership, then checks badge balance > 0 via Gateway. On success, creates a session (DB row + HTTP-only cookie with signed session ID).

### Server Pattern (Effect RPC, not Hono)

```
RpcServer.layerHttpRouter({ group: AppRpc, path: "/rpc" })
  → Layer.provide(HandlersLive)
  → Layer.provide(RpcSerialization.layerNdjson)
  → Layer.provide(HttpLayerRouter.layer)
  → Layer.provide(NodeHttpServer.layer({ port: 3000 }))
```

No Hono. CORS, routing, and middleware are all Effect-native via `@effect/platform`.

### Signing Flow

Server stores partial tx bytes but returns only metadata (epoch range, discriminator, timestamps, subintent hash, manifest). Client reconstructs the wallet request from those fields via `SubintentRequestBuilder`. Wallet independently computes the same subintent hash. Client sends signed partial hex back to server for validation.

### Submission

No server-side polling. Server submits to Gateway, returns `{ txId, status: 'submitted' }`. Submission is idempotent — Gateway/Radix Engine deduplicates by subintent hash.

---

## Workspace Packages

| Package | Description |
|---------|-------------|
| `apps/server` | Effect RPC server (`@effect/platform` NodeHttpServer) |
| `apps/client` | TanStack Start SPA (no SSR) |
| `apps/cli` | Bootstrap CLI (create superadmin, badge resource, mint initial badges) |
| `packages/shared` | Effect Schemas + RPC definitions (raw .ts exports, pnpm/turbo pattern) |
| `packages/database` | Drizzle schema + migrations (raw .ts exports) |

---

## Database Schema (6 tables)

### `vaults`
```sql
id              serial PRIMARY KEY
name            varchar(255) NOT NULL
account_address varchar(255) NOT NULL
is_superadmin   boolean NOT NULL DEFAULT false
created_at      timestamp NOT NULL DEFAULT now()
```

### `proposals`
```sql
id                          serial PRIMARY KEY
vault_id                    integer NOT NULL REFERENCES vaults(id) ON DELETE CASCADE
manifest_text               text NOT NULL
status                      varchar(20) NOT NULL DEFAULT 'created'
epoch_min                   integer
epoch_max                   integer
subintent_hash              varchar(255)
intent_discriminator        varchar(255)
min_proposer_timestamp      varchar(255)
max_proposer_timestamp      varchar(255)
partial_transaction_bytes   text          -- hex
created_by                  varchar(255) NOT NULL
created_at                  timestamp NOT NULL DEFAULT now()
submitted_at                timestamp
tx_id                       varchar(255)
invalid_reason              text
```

### `signatures`
```sql
id                             serial PRIMARY KEY
proposal_id                    integer NOT NULL REFERENCES proposals(id) ON DELETE CASCADE
signer_public_key              varchar(255) NOT NULL
signer_key_hash                varchar(255) NOT NULL
signature_bytes                text NOT NULL
signed_partial_transaction_hex text NOT NULL
is_valid                       boolean NOT NULL DEFAULT true
created_at                     timestamp NOT NULL DEFAULT now()
UNIQUE(proposal_id, signer_key_hash)
```

### `submission_attempts`
```sql
id                serial PRIMARY KEY
proposal_id       integer NOT NULL REFERENCES proposals(id) ON DELETE CASCADE
fee_payer_account varchar(255)
tx_hash           varchar(255)
status            varchar(50)
error_message     text
created_at        timestamp NOT NULL DEFAULT now()
```

### `sessions`
```sql
id              serial PRIMARY KEY
session_id      varchar(255) NOT NULL UNIQUE
wallet_address  varchar(255) NOT NULL
created_at      timestamp NOT NULL DEFAULT now()
expires_at      timestamp NOT NULL
```

### `challenges`
```sql
id          serial PRIMARY KEY
challenge   varchar(255) NOT NULL UNIQUE
expires_at  timestamp NOT NULL
used        boolean NOT NULL DEFAULT false
```

---

## RPC Groups

Per-group typed error unions (no `S.Never`).

### AuthRpc
- `GetChallenge` → returns server-generated challenge (stored in DB, single-use)
- `VerifyRola` → verify signature + badge check, create session, set cookie
- `GetSession` → return current session from cookie
- `Logout` → delete session

### VaultsRpc
- `ImportVault` → create DB record (name + account address), optionally verify auth delegates to superadmin
- `CreateVault` → build manifest to create new account + set owner to superadmin, sign with fee payer, submit to Gateway, store DB record with new address
- `ListVaults` → all vaults where `is_superadmin = false`
- `GetVault` → fetch by id
- `ResyncVault` → refresh on-chain state for a vault

### ProposalsRpc
- `CreateProposal` → compile manifest, build unsigned partial, store proposal
- `ListProposals` → query by vault_id, optional status filter (no pagination for MVP)
- `GetProposal` → fetch by id + on-demand validity check
- `SignProposal` → extract signature from signed partial hex, validate signer against superadmin access rule, store
- `GetSignatureStatus` → count signatures vs threshold
- `SubmitProposal` → compose notarized tx with fee payer, submit to Gateway, return tx hash + 'submitted'

### SuperadminRpc
- `GetSigners` → thin proxy: fetch superadmin access rule from Gateway, return signer list + threshold
- `GetBadgeResource` → return badge resource address (from env)

```typescript
export const AppRpc = RpcGroup.make(
  ...AuthRpc.requests,
  ...VaultsRpc.requests,
  ...ProposalsRpc.requests,
  ...SuperadminRpc.requests,
)
```

---

## Key Decisions

| Decision | Choice |
|----------|--------|
| Auth model | All vaults delegate to one global superadmin |
| Groups | Removed — flat vault list |
| Member records | None — badge ownership = membership |
| HTTP server | `@effect/platform` NodeHttpServer (not Hono) |
| RPC transport | `@effect/rpc` + `@effect/platform` |
| Rendering | SPA only (TanStack Start, no SSR, no Nitro) |
| Tx submission | No server polling — return tx hash + 'submitted' |
| Error model | Per-RPC-group typed error unions |
| Access rules | CountOf + AllOf (flat, no nested) |
| Badge type | Fungible, soul-bound, minter authority on superadmin account |
| Badge minting | Via superadmin proposal (any badge holder proposes, signers approve) |
| Signer management | Via superadmin proposal (change access rule manifest) |
| Create vs sign | Separate operations |
| Signing flow | Server returns metadata, client builds SubintentRequestBuilder |
| Submission concurrency | Idempotent (Gateway deduplicates) |
| Fee payer | Small XRD balance, manual top-up |
| Network | Fully configurable (stokenet + mainnet) |
| Manifest builders | Client-side helpers |
| State management | `@effect-atom/atom-react` for everything |
| Pagination | Not for MVP |
| Superadmin UI | Separate section from vault list |
| Superadmin in DB | Vault record with `is_superadmin = true` |
| Vault add | Import existing (DB record + optional auth verification) or create new on-chain (fee payer signs creation tx, stores DB record) |
| Sessions | DB table, HTTP-only cookie with signed session ID |
| DB schema derivation | `drizzle-orm/effect-schema` generates Effect schemas from Drizzle tables |
| Schema class preservation | Wrap `createSelectSchema().fields` in `S.Class` for RPC compat |
| Column naming | camelCase JS props, explicit snake_case DB names in Drizzle builders |
| Timestamp overrides | Override with `S.DateFromString` in derived schemas (RPC wire format is ISO string) |
| Raw .ts exports | Standard pnpm/turbo monorepo pattern |
| TS Radix Engine Toolkit | Supports V2 (SubintentManifestV2, PartialTransactionV2) |
| `@radix-effects/gateway` | User's own published library on npm |
| Re-sync | Manual button to refresh vault/superadmin on-chain state |

---

## Phase 1: Monorepo Scaffold

### Step 1.1: Root Configuration

**`package.json`**
```jsonc
{
  "name": "radix-vaults",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "check-types": "turbo run check-types",
    "format": "biome format --write",
    "db:migrate": "turbo run db:migrate",
    "db:generate": "turbo run db:generate",
    "db:studio": "turbo run db:studio"
  },
  "devDependencies": {
    "@biomejs/biome": "2.3.8",
    "turbo": "^2.6.3",
    "typescript": "5.9.3"
  },
  "packageManager": "pnpm@10.25.0",
  "engines": { "node": ">=22" }
}
```

**`pnpm-workspace.yaml`** with catalog pinning all Effect/Radix/TanStack deps (match consultation_v2 versions).

**`turbo.json`** — same as consultation_v2 (build/lint/check-types cached; dev/test/db:* persistent+uncached).

**`biome.json`** — formatter + linter config.

**`.gitignore`** — node_modules, dist, .output, .env*, .turbo, drizzle/*.sql (generated).

### Step 1.2: Workspace Packages

Create five workspaces:
- `apps/server/package.json` — name: `server`
- `apps/client/package.json` — name: `client`
- `apps/cli/package.json` — name: `cli`
- `packages/shared/package.json` — name: `shared`
- `packages/database/package.json` — name: `db`

Each with `"type": "module"` and appropriate deps from catalog.

**Dependency graph**: `shared` depends on `db` (`"db": "workspace:*"`) so it can import Drizzle table definitions for schema derivation.

### Step 1.3: TypeScript Configs

- `apps/server/tsconfig.json` — strict, ES2022, ESNext module, bundler resolution, `@effect/language-service` plugin
- `apps/client/tsconfig.json` — strict, react-jsx, DOM libs, `@/*` path alias
- `apps/cli/tsconfig.json` — strict, ES2022, ESNext module
- `packages/shared` — no tsconfig (exports raw `.ts` via `"exports": { "./*": "./src/*.ts" }`)
- `packages/database` — no tsconfig (same raw `.ts` export pattern)

### Step 1.4: Docker Compose (dev)

```yaml
services:
  postgres:
    image: postgres:17
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: radix_vaults
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes: [pgdata:/var/lib/postgresql/data]
volumes:
  pgdata:
```

### Step 1.5: Environment

**`.env.example`**:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/radix_vaults
NETWORK_ID=2
SUPERADMIN_ADDRESS=account_tdx_2_1...
ROLA_BADGE_RESOURCE=resource_tdx_2_1...
FEE_PAYER_PRIVATE_KEY_HEX=...
DAPP_DEFINITION_ADDRESS=account_tdx_2_1...
```

**Files to create:**
- `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `biome.json`, `.gitignore`
- `apps/server/package.json`, `apps/server/tsconfig.json`
- `apps/client/package.json`, `apps/client/tsconfig.json`
- `apps/cli/package.json`, `apps/cli/tsconfig.json`
- `packages/shared/package.json`
- `packages/database/package.json`
- `docker-compose.yml`, `.env.example`

---

## Phase 2: Database Schema (Drizzle)

### Step 2.1: Database Package

**`packages/database/package.json`**:
```jsonc
{
  "name": "db",
  "type": "module",
  "exports": { "./*": "./src/*.ts" },
  "dependencies": { "drizzle-orm": "catalog:", "pg": "catalog:" },
  "devDependencies": { "drizzle-kit": "^0.31.8" }
}
```

**`packages/database/drizzle.config.ts`** — PostgreSQL dialect, `src/schema.ts` source, `drizzle/` output.

### Step 2.2: Schema Definition

**`packages/database/src/schema.ts`** — 6 tables as defined in the Database Schema section above. All tables use **camelCase JS property names** with **explicit snake_case DB column names** so that `createSelectSchema` produces camelCase fields matching Effect schema conventions:

```typescript
export const vaults = pgTable('vaults', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  accountAddress: varchar('account_address', { length: 255 }).notNull(),
  isSuperadmin: boolean('is_superadmin').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

Same pattern for all 6 tables:
- `vaults` (with `isSuperadmin` flag, no `groupId`)
- `proposals` (references `vaults.id`, fields: `vaultId`, `manifestText`, `epochMin`, `epochMax`, `subintentHash`, `intentDiscriminator`, `minProposerTimestamp`, `maxProposerTimestamp`, `partialTransactionBytes`, `createdBy`, `createdAt`, `submittedAt`, `txId`, `invalidReason`)
- `signatures` (UNIQUE on `proposalId, signerKeyHash`, fields: `proposalId`, `signerPublicKey`, `signerKeyHash`, `signatureBytes`, `signedPartialTransactionHex`, `isValid`, `createdAt`)
- `submissionAttempts` (`proposalId`, `feePayerAccount`, `txHash`, `status`, `errorMessage`, `createdAt`)
- `sessions` (`sessionId`, `walletAddress`, `createdAt`, `expiresAt`)
- `challenges` (`challenge`, `expiresAt`, `used`)

### Step 2.3: Generate Initial Migration

Run `pnpm drizzle-kit generate` → creates `packages/database/drizzle/0000_*.sql`.

### Step 2.4: ORM Service + PgClient + Migrations

In `apps/server/src/db/`:
- `orm.ts` — `ORM extends Effect.Service` wrapping `Pg.make({ schema: DbSchema })` (copy consultation_v2 pattern)
- `pgClient.ts` — `PgClientLive` Layer from `DATABASE_URL` config
- `migrate.ts` — `DatabaseMigrations` service

**Files to create:**
- `packages/database/package.json`, `packages/database/drizzle.config.ts`, `packages/database/src/schema.ts`
- `apps/server/src/db/orm.ts`, `apps/server/src/db/pgClient.ts`, `apps/server/src/db/migrate.ts`

---

## Phase 3: Shared Package — Schemas & RPC Definitions

### Step 3.1: Domain Schemas

**`packages/shared/src/schemas.ts`** — Effect Schema definitions. DB-backed schemas are **derived from Drizzle tables** via `drizzle-orm/effect-schema`; non-DB schemas remain hand-written.

```typescript
import { Schema as S } from 'effect'
import { createSelectSchema, createInsertSchema } from 'drizzle-orm/effect-schema'
import { vaults, proposals, signatures } from 'db/schema'

// --- Hand-written (non-DB) ---

export const ProposalStatus = S.Literal(
  'created', 'signing', 'ready', 'submitting',
  'committed', 'failed', 'expired', 'invalid'
)

export class Signer extends S.Class<Signer>('Signer')({
  signerPublicKey: S.String,
  signerKeyHash: S.String,
  keyType: S.String,
}) {}

export class AccessRuleInfo extends S.Class<AccessRuleInfo>('AccessRuleInfo')({
  signers: S.Array(Signer),
  threshold: S.Number,
}) {}

// --- Derived from Drizzle tables ---

export class Vault extends S.Class<Vault>('Vault')(
  createSelectSchema(vaults, { createdAt: S.DateFromString }).fields
) {}

export class Proposal extends S.Class<Proposal>('Proposal')(
  createSelectSchema(proposals, {
    status: ProposalStatus,
    createdAt: S.DateFromString,
    submittedAt: S.NullOr(S.DateFromString),
  }).fields
) {}

export class Signature extends S.Class<Signature>('Signature')(
  // Omit internal fields not sent to clients
  S.omit(createSelectSchema(signatures, {
    createdAt: S.DateFromString,
  }), 'signatureBytes', 'signedPartialTransactionHex').fields
) {}

// Insert schemas for server-side validation
export const VaultInsert = createInsertSchema(vaults)
export const ProposalInsert = createInsertSchema(proposals)

// --- Hand-written (composite, uses derived Signature) ---

export class SignatureStatus extends S.Class<SignatureStatus>('SignatureStatus')({
  proposalId: S.Number,
  signatures: S.Array(Signature),
  threshold: S.Number,
  collected: S.Number,
  remaining: S.Number,
}) {}
```

### Step 3.2: RPC Endpoint Definitions

**`packages/shared/src/rpc.ts`** — four RPC groups with typed errors:

```typescript
import { Rpc, RpcGroup } from '@effect/rpc'
import { Schema as S } from 'effect'
import * as Schemas from './schemas'

// --- Auth ---
export class GetChallenge extends Rpc.make('GetChallenge')({
  success: S.Struct({ challenge: S.String }),
  error: S.Union(/* AuthError */),
}) {}

export class VerifyRola extends Rpc.make('VerifyRola')({
  payload: { proof: S.String, accountAddress: S.String },
  success: S.Struct({ sessionId: S.String, walletAddress: S.String }),
  error: S.Union(/* AuthError, NoBadgeError */),
}) {}

// ... GetSession, Logout

// --- Vaults ---
export class ImportVault extends Rpc.make('ImportVault')({
  payload: { name: S.String, accountAddress: S.String },
  success: Schemas.Vault,
  error: S.Union(/* NotFoundError, NotDelegatedError */),
}) {}

export class CreateVault extends Rpc.make('CreateVault')({
  payload: { name: S.String },
  success: Schemas.Vault,
  error: S.Union(/* GatewayError, ManifestCompileError */),
}) {}

// ... ListVaults, GetVault, ResyncVault

// --- Proposals ---
export class CreateProposal extends Rpc.make('CreateProposal')({
  payload: { vaultId: S.Number, manifestText: S.String, expiryEpoch: S.Number },
  success: Schemas.Proposal,
  error: S.Union(/* VaultNotFound, ManifestCompileError */),
}) {}

// ... ListProposals, GetProposal, SignProposal, GetSignatureStatus, SubmitProposal

// --- Superadmin ---
export class GetSigners extends Rpc.make('GetSigners')({
  success: Schemas.AccessRuleInfo,
  error: S.Union(/* GatewayError */),
}) {}

export class GetBadgeResource extends Rpc.make('GetBadgeResource')({
  success: S.Struct({ resourceAddress: S.String }),
  error: S.Never,
}) {}

// --- Groups ---
export const AuthRpc = RpcGroup.make(GetChallenge, VerifyRola, GetSession, Logout).prefix('auth')
export const VaultsRpc = RpcGroup.make(ImportVault, CreateVault, ListVaults, GetVault, ResyncVault).prefix('vaults')
export const ProposalsRpc = RpcGroup.make(
  CreateProposal, ListProposals, GetProposal,
  SignProposal, GetSignatureStatus, SubmitProposal
).prefix('proposals')
export const SuperadminRpc = RpcGroup.make(GetSigners, GetBadgeResource).prefix('superadmin')

export const AppRpc = RpcGroup.make(
  ...AuthRpc.requests,
  ...VaultsRpc.requests,
  ...ProposalsRpc.requests,
  ...SuperadminRpc.requests,
)
```

### Step 3.3: Validation Helpers

**`packages/shared/src/validation.ts`**:
- `validateManifestText(text)` — non-empty, valid UTF-8
- Address format validators (Radix bech32 patterns)

**Files to create:**
- `packages/shared/src/schemas.ts`
- `packages/shared/src/rpc.ts`
- `packages/shared/src/validation.ts`

---

## Phase 4: Server — Core Services

### Step 4.1: Server Entry Point + Layers

**`apps/server/src/main.ts`** — Effect RPC server startup using `@effect/platform` NodeHttpServer:
- Mount Effect RPC HTTP handler at `/rpc`
- CORS via Effect HttpMiddleware
- Run migrations on startup
- Listen on configurable port

**`apps/server/src/layers.ts`** — Layer composition:
```
ServerLayer = Layer.mergeAll(
  VaultsHandler.Default,
  ProposalsHandler.Default,
  AuthHandler.Default,
  SuperadminHandler.Default,
  DatabaseMigrations.Default,
).pipe(
  Layer.provideMerge(AuthMiddleware.Default),
  Layer.provide(ORM.Default),
  Layer.provideMerge(GatewayClient.Default),
  Layer.provideMerge(FeePayerService.Default),
  Layer.provideMerge(PgClientLive),
  Layer.provideMerge(LoggerLayer),
)
```

### Step 4.2: Auth Service (ROLA)

**`apps/server/src/auth/rola.ts`**:
- ROLA verification service (Effect Service)
- `GetChallenge`: generate random challenge, store in `challenges` table with expiry
- `VerifyRola`: look up challenge (verify exists, not used, not expired), delete after use, verify signed challenge proves wallet ownership, check badge balance > 0 via Gateway, create session in DB, return session cookie

**`apps/server/src/auth/middleware.ts`**:
- RPC middleware that extracts session cookie
- Looks up session in DB → provides `CurrentUser` context tag (wallet address)
- Applied to all RPC groups except AuthRpc

### Step 4.3: Gateway Client Service

**`apps/server/src/gateway/client.ts`**:
- Effect Service wrapping Radix Gateway API calls via `@radix-effects/gateway`
- Methods: `getAccessRule(accountAddress)`, `getCurrentEpoch()`, `submitTransaction(hex)`, `getEntityDetails(address)`, `getAccountBalances(address)`

### Step 4.4: Fee Payer Service

**`apps/server/src/feePayer/service.ts`**:
- Reads `FEE_PAYER_PRIVATE_KEY_HEX` from config
- Derives Ed25519 public key + account address
- Composes NotarizedTransactionV2: main intent (`lock_fee` + `yield_to_child`) wrapping signed child subintent
- Uses `@radixdlt/radix-engine-toolkit` (TS WASM, supports V2)

### Step 4.5: Manifest Compiler Service

**`apps/server/src/manifest/compiler.ts`**:
- Validates incoming manifest text by compiling to SubintentManifestV2
- Appends `YIELD_TO_PARENT;` if missing
- Extracts accounts requiring auth from compiled manifest effects

**Files to create:**
- `apps/server/src/main.ts`
- `apps/server/src/layers.ts`
- `apps/server/src/auth/rola.ts`, `apps/server/src/auth/middleware.ts`
- `apps/server/src/gateway/client.ts`
- `apps/server/src/feePayer/service.ts`
- `apps/server/src/manifest/compiler.ts`

---

## Phase 5: Server — RPC Handlers

### Step 5.1: Vaults Handler

**`apps/server/src/handlers/vaults.ts`**:
- `ImportVault` — insert vault record (name + account address), optionally verify auth delegates to superadmin via Gateway
- `CreateVault` — build manifest (create account + set owner role to superadmin), compile, sign with fee payer key, submit to Gateway, extract new account address from transaction receipt, store vault DB record
- `ListVaults` — query vaults where `is_superadmin = false`
- `GetVault` — fetch by id
- `ResyncVault` — re-fetch on-chain state (balances, verify auth delegation still valid)

### Step 5.2: Proposals Handler

**`apps/server/src/handlers/proposals.ts`**:
- `CreateProposal`:
  1. Verify vault exists
  2. Compile manifest (validate + append YIELD_TO_PARENT)
  3. Fetch current epoch from Gateway
  4. Validate expiryEpoch > currentEpoch
  5. Build unsigned PartialTransactionV2 with random intent_discriminator
  6. Store proposal (manifest, subintent_hash, partial_transaction_bytes, epoch range, status: created)
  7. Return proposal

- `SignProposal`:
  1. Deserialize signed partial hex → extract signature + public key
  2. Hash public key → key_hash
  3. Fetch superadmin access rule from Gateway, verify key_hash is in signer list
  4. Validate subintent hash matches proposal's stored hash
  5. Store signature (UNIQUE constraint handles duplicates)
  6. Count valid signatures → if >= threshold, update status to 'ready'
  7. If first signature and status was 'created', update to 'signing'
  8. Return SignatureStatus

- `SubmitProposal`:
  1. Verify status is 'ready'
  2. Reconstruct signed partial: combine stored unsigned partial + all valid signatures
  3. Use FeePayerService to compose NotarizedTransactionV2
  4. Submit to Gateway
  5. Store submission attempt
  6. Update proposal status to 'submitted', store tx_id
  7. Return `{ txId, status: 'submitted' }`

- `ListProposals` — query by vault, optional status filter, no pagination
- `GetProposal` — fetch by id + on-demand validity check (epoch expiry, access rule changes)
- `GetSignatureStatus` — count signatures, compare to superadmin threshold

### Step 5.3: Auth Handler

**`apps/server/src/handlers/auth.ts`**:
- `GetChallenge` → generate + store challenge
- `VerifyRola` → verify ROLA proof, check badge, create session
- `GetSession` → return current session from cookie
- `Logout` → delete session from DB

### Step 5.4: Superadmin Handler

**`apps/server/src/handlers/superadmin.ts`**:
- `GetSigners` → fetch superadmin access rule from Gateway, parse, return signer list + threshold
- `GetBadgeResource` → return `ROLA_BADGE_RESOURCE` from env

### Step 5.5: On-Demand Validity Checking

Embedded in `GetProposal` handler:
1. Check current epoch > epoch_max → mark 'expired'
2. Fetch current superadmin access rule from Gateway
3. Invalidate signatures from removed signers (set `is_valid = false`)
4. If valid signature count < threshold and was 'ready' → mark 'invalid'
5. Return updated proposal

**Files to create:**
- `apps/server/src/handlers/vaults.ts`
- `apps/server/src/handlers/proposals.ts`
- `apps/server/src/handlers/auth.ts`
- `apps/server/src/handlers/superadmin.ts`

---

## Phase 6: Client — TanStack Start SPA

### Step 6.1: Client Scaffold

**`apps/client/vite.config.ts`** — TanStack Start + Vite React + Tailwind (SPA mode, no SSR, no Nitro):
```typescript
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
```

**`apps/client/src/app.css`** — Tailwind imports + shadcn theme variables.

**`apps/client/src/router.tsx`** — TanStack Router setup with file-based routing.

**`apps/client/src/entry-client.tsx`** — SPA entry point only (no entry-server.tsx).

### Step 6.2: Radix Dapp Toolkit Integration

**`apps/client/src/lib/dappToolkit.ts`**:
- `RadixDappToolkit` class with `Layer.scoped` (browser-only guard)
- Configures with NETWORK_ID + DAPP_DEFINITION_ADDRESS from env vars
- Cleanup via `Effect.addFinalizer`

**`apps/client/src/lib/envVars.ts`** — Client env var schema:
- `VITE_PUBLIC_SERVER_URL`, `VITE_PUBLIC_NETWORK_ID`, `VITE_PUBLIC_DAPP_DEFINITION_ADDRESS`

### Step 6.3: RPC Client Setup

**`apps/client/src/lib/rpcClient.ts`**:
- Effect RPC client from shared `AppRpc` group
- HTTP transport pointing at server `/rpc` endpoint
- Auth cookie sent automatically (credentials: include)

### Step 6.4: Effect Atoms

**`apps/client/src/atom/runtime.ts`** — `makeRuntimeAtom` for Effect-atom integration.

**`apps/client/src/atom/auth.ts`**:
- `walletAddressAtom` — connected wallet address
- `isAuthenticatedAtom` — session active state
- `loginAtom` — triggers ROLA challenge-response flow (GetChallenge → wallet sign → VerifyRola)

**`apps/client/src/atom/vaults.ts`**:
- `vaultsListAtom` — fetches all vaults (flat list)
- `importVaultAtom`
- `createVaultAtom`
- `vaultDetailAtom(id)`

**`apps/client/src/atom/proposals.ts`**:
- `proposalsListAtom(vaultId, status?)` — fetches proposals
- `proposalDetailAtom(id)` — fetches proposal + on-demand validity
- `createProposalAtom` — creates proposal via RPC
- `signatureStatusAtom(proposalId)` — fetches signature progress

**`apps/client/src/atom/signing.ts`**:
- `handleSignAtom(proposalDetailAtom, sigStatusAtom)`:
  1. Get RDT instance
  2. Build SubintentRequestBuilder with proposal's header values
  3. Call `rdt.walletApi.sendPreAuthorizationRequest()`
  4. Validate returned subintent hash matches expected
  5. Send signed partial to server via `SignProposal` RPC
  6. Refresh atoms

**`apps/client/src/atom/submit.ts`**:
- `submitProposalAtom(proposalId)` — calls `SubmitProposal` RPC

**`apps/client/src/atom/superadmin.ts`**:
- `signersAtom` — fetches superadmin signers via `GetSigners` RPC
- `badgeResourceAtom` — fetches badge resource address

### Step 6.5: Manifest Builders (Client-Side)

**`apps/client/src/lib/manifest.ts`**:
- `buildSetAuthDelegationManifest({ accountAddress, superadminAddress })` — sets vault auth to delegate to superadmin
- `buildMintBadgeManifest({ badgeResource, recipientAddress })` — mint 1 badge + deposit
- `buildBurnBadgeManifest({ badgeResource, targetAddress })` — burn/revoke badge
- `buildChangeSignersManifest({ superadminAddress, signers, threshold })` — change superadmin access rule
- `buildTransferManifest({ fromAccount, toAccount, resourceAddress, amount })` — basic transfer

### Step 6.6: shadcn/ui Setup

Run `npx shadcn@latest init` in `apps/client/`. Install components as needed:
- Button, Card, Input, Label, Select, Dialog, Badge, Table, Tabs, Separator, Sonner (toast)

### Step 6.7: Routes & Pages

File-based routing under `apps/client/src/routes/`:

**`__root.tsx`** — Root layout with sidebar nav + wallet connect button.

**`index.tsx`** — Dashboard: vault list + pending proposal counts.

**`vaults/add.tsx`** — Add vault form with import/create toggle: import mode enters account address + name and verifies auth delegation; create mode enters name only, server creates on-chain account.

**`vaults/$vaultId.tsx`** — Vault detail: balance, proposals list (filterable by status), create proposal button.

**`vaults/$vaultId/proposals/new.tsx`** — Create proposal form: manifest text editor, expiry epoch selector.

**`vaults/$vaultId/proposals/$proposalId.tsx`** — Proposal detail: status badge, manifest text, signature progress (collected/threshold), per-signer table, sign button, submit button, tx ID link.

**`superadmin/index.tsx`** — Superadmin section: current signers + threshold, badge resource info, re-sync button.

**`superadmin/badges.tsx`** — Badge management: mint (enter account address), badge burn/revoke. Creates proposals on superadmin vault.

**`superadmin/signers.tsx`** — Signer management: view current signers, create proposal to change access rule.

**`superadmin/proposals.tsx`** — Superadmin proposals list (badge mints, signer changes).

### Step 6.8: Key UI Components

**`src/components/layout/Sidebar.tsx`** — Vault nav, superadmin section, user info, wallet connect.

**`src/components/layout/WalletConnect.tsx`** — Radix wallet connect button.

**`src/components/proposals/ManifestEditor.tsx`** — Textarea for manifest text with syntax hints.

**`src/components/proposals/SignatureProgress.tsx`** — Progress bar + per-signer status table.

**`src/components/proposals/StatusBadge.tsx`** — Colored badge per ProposalStatus.

**`src/components/vaults/BalanceDisplay.tsx`** — Shows vault token balances.

**Files to create:**
- `apps/client/vite.config.ts`, `apps/client/src/app.css`, `apps/client/src/router.tsx`
- `apps/client/src/entry-client.tsx`
- `apps/client/src/lib/dappToolkit.ts`, `apps/client/src/lib/envVars.ts`
- `apps/client/src/lib/rpcClient.ts`, `apps/client/src/lib/manifest.ts`
- `apps/client/src/atom/runtime.ts`, `apps/client/src/atom/auth.ts`
- `apps/client/src/atom/vaults.ts`, `apps/client/src/atom/proposals.ts`
- `apps/client/src/atom/signing.ts`, `apps/client/src/atom/submit.ts`
- `apps/client/src/atom/superadmin.ts`
- All route files under `apps/client/src/routes/`
- All component files under `apps/client/src/components/`

---

## Phase 7: Server — Radix Integration (Transaction Building)

### Step 7.1: Subintent Builder

**`apps/server/src/manifest/subintentBuilder.ts`**:
- Uses `@radixdlt/radix-engine-toolkit` (TypeScript WASM, supports V2)
- Builds unsigned PartialTransactionV2 from:
  - Compiled manifest instructions
  - IntentHeaderV2 (network_id, epoch range, random discriminator, proposer timestamps)
- Returns: serialized partial bytes (hex) + subintent hash

### Step 7.2: Transaction Composer

**`apps/server/src/manifest/transactionComposer.ts`**:
- Combines signed child subintent + fee payer main intent
- Main intent manifest: `lock_fee(fee_payer_account, 10) + yield_to_child("withdrawal")`
- Signs as notary with fee payer key (notary_is_signatory: true)
- Returns NotarizedTransactionV2 hex

### Step 7.3: Signature Extractor

**`apps/server/src/manifest/signatureExtractor.ts`**:
- Deserializes SignedPartialTransactionV2 hex
- Extracts Ed25519 signature + public key from root_subintent_signatures
- Computes key_hash (blake2b of public key)
- Validates subintent hash matches expected

### Step 7.4: Access Rule Parser

**`apps/server/src/gateway/accessRuleParser.ts`**:
- Parses Gateway entity/details response
- Extracts owner role access rule
- Supports **CountOf** (n-of-m) and **AllOf** (all must sign, treated as n-of-n)
- Flat rules only — rejects AnyOf and nested structures
- Resolves signers (NonFungibleGlobalId → public key hash, key type)

**Files to create:**
- `apps/server/src/manifest/subintentBuilder.ts`
- `apps/server/src/manifest/transactionComposer.ts`
- `apps/server/src/manifest/signatureExtractor.ts`
- `apps/server/src/gateway/accessRuleParser.ts`

---

## Phase 8: CLI Bootstrap Tool

### Step 8.1: CLI Package

**`apps/cli/package.json`**:
```jsonc
{
  "name": "cli",
  "type": "module",
  "bin": { "radix-vaults-cli": "./dist/main.js" },
  "dependencies": {
    "@radixdlt/radix-engine-toolkit": "catalog:",
    "@radix-effects/gateway": "catalog:",
    "effect": "catalog:"
  }
}
```

### Step 8.2: Bootstrap Command

**`apps/cli/src/bootstrap.ts`**:

Input: `bootstrap.json` + env var `FEE_PAYER_PRIVATE_KEY_HEX`
```json
{
  "networkId": 2,
  "signers": [
    { "publicKeyHex": "...", "keyType": "EddsaEd25519" },
    { "publicKeyHex": "...", "keyType": "EddsaEd25519" },
    { "publicKeyHex": "...", "keyType": "EddsaEd25519" }
  ],
  "threshold": 2,
  "initialBadgeRecipients": [
    "account_tdx_2_1...",
    "account_tdx_2_1..."
  ]
}
```

Steps:
1. Read config + `FEE_PAYER_PRIVATE_KEY_HEX` from env, derive fee payer account from private key
2. Create superadmin multisig account on-chain (CountOf threshold + signer virtual badges)
3. Create soul-bound fungible badge resource with mint authority on superadmin account
4. Mint initial badges to specified recipient addresses
5. Output env var values:
   ```
   SUPERADMIN_ADDRESS=account_tdx_2_1...
   ROLA_BADGE_RESOURCE=resource_tdx_2_1...
   ```

All transactions signed with fee payer key.

**Files to create:**
- `apps/cli/package.json`, `apps/cli/tsconfig.json`
- `apps/cli/src/main.ts` (CLI entry point)
- `apps/cli/src/bootstrap.ts` (bootstrap logic)

---

## Phase 9: Tests

### Step 9.1: Shared Schema Tests

**`packages/shared/src/schemas.test.ts`**:
- Encode/decode roundtrips for all domain types (including derived schemas)
- Roundtrip tests for derived schemas: verify Vault, Proposal, Signature survive encode → decode
- Verify `S.Class` `instanceof` works on derived schemas (e.g. `decoded instanceof Vault`)
- Verify insert schemas (`VaultInsert`, `ProposalInsert`) reject auto-generated fields (`id`, `createdAt`)
- Validation edge cases (empty strings, malformed addresses)
- ProposalStatus enum validation

### Step 9.2: Server Integration Tests

Use `@testcontainers/postgresql` for real Postgres.

**`apps/server/src/__tests__/vaults.test.ts`**:
- Import vault → stores record
- Create vault → creates on-chain account + stores record
- List vaults → excludes superadmin
- Re-sync vault

**`apps/server/src/__tests__/proposals.test.ts`**:
- Full lifecycle: create → sign → threshold met → submit
- Duplicate signature rejection (UNIQUE constraint)
- Invalid signer rejection (not in superadmin access rule)
- Epoch expiry detection
- Status transitions

**`apps/server/src/__tests__/auth.test.ts`**:
- Valid ROLA proof → session created
- Missing badge → rejected
- Expired/invalid challenge → rejected
- Challenge single-use → second attempt rejected

### Step 9.3: Manifest Tests

**`apps/server/src/__tests__/manifest.test.ts`**:
- Compile valid manifest → success
- Invalid manifest → error
- YIELD_TO_PARENT auto-append
- Account extraction from compiled effects

### Step 9.4: Access Rule Parser Tests

**`apps/server/src/__tests__/accessRuleParser.test.ts`**:
- Parse CountOf rule → signers + threshold
- Parse AllOf rule → signers + threshold = count
- Reject AnyOf → error
- Reject nested rules → error

**Files to create:**
- `packages/shared/src/schemas.test.ts`
- `apps/server/src/__tests__/vaults.test.ts`
- `apps/server/src/__tests__/proposals.test.ts`
- `apps/server/src/__tests__/auth.test.ts`
- `apps/server/src/__tests__/manifest.test.ts`
- `apps/server/src/__tests__/accessRuleParser.test.ts`

---

## Execution Order

1. **Phase 1** — Monorepo scaffold (config files only)
2. **Phase 2** — Database schema + ORM services
3. **Phase 3** — Shared schemas + RPC definitions
4. **Phase 4** — Server core services (auth/ROLA, gateway client, fee payer, manifest compiler)
5. **Phase 5** — Server RPC handlers (vaults, proposals, auth, superadmin)
6. **Phase 6** — Client SPA (scaffold, atoms, routes, components)
7. **Phase 7** — Server Radix integration (subintent builder, tx composer, sig extractor, access rule parser)
8. **Phase 8** — CLI bootstrap tool
9. **Phase 9** — Tests

Within phases, steps can often be parallelized. Phase 7 can be started alongside Phase 5.

**Critical path**: Phase 1 → Phase 2 → Phase 3 → Phase 4+5+7 (parallel) → Phase 6 → Phase 8 → Phase 9.

---

## Key Dependencies (from pnpm catalog)

| Package | Version | Where |
|---------|---------|-------|
| `effect` | 3.19.11 | all |
| `@effect/platform` | ^0.93.6 | server, client, shared |
| `@effect/platform-node` | ^0.103.0 | server |
| `@effect/platform-browser` | ^0.73.0 | client |
| `@effect/rpc` | ^0.72.2 | server, client, shared |
| `@effect/sql` | ^0.48.6 | server |
| `@effect/sql-drizzle` | ^0.47.0 | server |
| `@effect/sql-pg` | ^0.49.7 | server |
| `@effect/vitest` | ^0.27.0 | server, shared (dev) |
| `drizzle-orm` | 0.45.1 | database, shared (subpath `drizzle-orm/effect-schema` for schema derivation) |
| `drizzle-kit` | ^0.31.8 | database (dev) |
| `pg` | ^8.16.0 | server, database |
| `@tanstack/react-start` | ^1.132.0 | client |
| `@tanstack/react-router` | ^1.132.0 | client |
| `@tanstack/router-plugin` | ^1.132.0 | client |
| `@radixdlt/radix-dapp-toolkit` | ^2.2.1 | client |
| `@radixdlt/radix-engine-toolkit` | latest | server, cli |
| `@radix-effects/gateway` | ^0.5.0 | server, cli, shared |
| `@effect-atom/atom-react` | ^0.4.4 | client |
| `tailwindcss` | ^4.0.6 | client |
| `@testcontainers/postgresql` | ^11.10.0 | server (dev) |
| `vitest` | 3.2.4 | all (dev) |
| `tsx` | ^4.21.0 | server, cli (dev) |
| `tsdown` | ^0.17.2 | server, cli |
