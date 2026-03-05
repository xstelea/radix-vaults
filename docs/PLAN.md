# Implementation Plan: Multisig Vaults

## Overview

TypeScript Turbo+pnpm monorepo: Effect RPC server, TanStack Start SPA client, bootstrap CLI, shared schemas package. Team account controls member badge mint/recall/burn only. Each vault has its own independent signer set and threshold via owner-role multisig. Reads are public; authenticated member badge holders can perform write actions. Each vault threshold remains the authorization gate for vault signatures. Members must self-register an Ed25519 signer source before signing proposals.

## Reference Repos

- **consultation_v2** — monorepo structure, Turbo/pnpm config, Drizzle ORM, Effect Layer composition, TanStack Start client
- **multisig** — proposal lifecycle, manifest builders, subintent signing, fee payer, access rule parsing, wallet integration

---

## Architecture

### Auth Model

Team account is configured from env (`TEAM_ACCOUNT_ADDRESS`) and only governs badge operations. Each vault uses `OwnerRole::Updatable(require_n_of(vault_threshold, [signer_virtual_badges]))` with signer sets chosen per vault. Member signer identity is self-registered as an Ed25519 signer source (manual entry, one per member). Each vault controls its own owner rule and signer updates through vault-local `SET_OWNER_ROLE` proposals.

**ROLA flow**: server generates a challenge (stored in `challenges` table, single-use), client signs with wallet, server verifies signature proves wallet ownership, then checks badge balance > 0 via Gateway. On success, creates or rotates a per-device session (DB row + HTTP-only session cookie).

**Team consistency warning**: compare team account owner-rule signer set with registered member signer sources (Ed25519). If sets differ, surface a signer-set mismatch warning in Team UI, vault pages, proposal pages, and TeamRpc responses.

**Team member badge policy (soul-bound fungible)**: use role restrictions to prevent voluntary transfer (withdraw/deposit constraints), while allowing Team-controlled recall and burn. Members can hold/use badge for access, but cannot transfer it to another account.

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

Server stores partial tx bytes but returns metadata (discriminator, proposer timestamps, subintent hash, manifest). Client reconstructs the wallet request from those fields via `SubintentRequestBuilder` using unix timestamp expiration (`atTime`). Wallet independently computes the same subintent hash. Client sends signed partial hex back to server for validation.

### Submission

No server-side polling loop. Server submits to Gateway, returns `{ txId, status: 'submitted' }`. Submission is idempotent — Gateway/Radix Engine deduplicates by hash, and server exposes a manual refresh endpoint for submitted tx state.

---

## Workspace Packages

| Package | Description |
|---------|-------------|
| `apps/server` | Effect RPC server (`@effect/platform` NodeHttpServer) |
| `apps/client` | TanStack Start SPA (no SSR) |
| `apps/cli` | Bootstrap CLI (create team account, member badge resource, mint initial badges) |
| `packages/shared` | Effect Schemas + RPC definitions (raw .ts exports, pnpm/turbo pattern) |
| `packages/database` | Drizzle schema + migrations (raw .ts exports) |

---

## Database Schema (7 tables)

### `vaults`
```sql
name            varchar(255) NOT NULL
account_address varchar(255) PRIMARY KEY
created_at      timestamp NOT NULL DEFAULT now()
```

### `proposals`
```sql
id                          serial PRIMARY KEY
vault_address               varchar(255) NOT NULL REFERENCES vaults(account_address) ON DELETE CASCADE
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
signer_key_type                varchar(50)  NOT NULL
signer_key_hash                varchar(255) NOT NULL
signature_bytes                text NOT NULL
signed_partial_transaction_hex text NOT NULL
created_at                     timestamp NOT NULL DEFAULT now()
UNIQUE(proposal_id, signer_key_type, signer_key_hash)
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
```

### `member_signer_sources`
```sql
id                    serial PRIMARY KEY
member_wallet_address varchar(255) NOT NULL UNIQUE
signer_public_key     text NOT NULL
signer_key_hash       varchar(255) NOT NULL
created_at            timestamp NOT NULL DEFAULT now()
updated_at            timestamp NOT NULL DEFAULT now()
```

---

## RPC Groups

Per-group typed error unions.

### AuthRpc
- `GetChallenge` → returns server-generated challenge (stored in DB, single-use)
- `VerifyRola` → verify signature + badge check, create session, set cookie
- `GetSession` → return current session from cookie
- `Logout` → delete session

### VaultsRpc
- `ImportVault` → create DB record (name + account address), read and verify supported access rule (CountOf/AllOf)
- `CreateVault` → payload: `{ name, threshold, signers }`, build manifest to create new account with owner role `require_n_of(threshold, signers)`, sign with fee payer, submit to Gateway, store DB record with new address
- `ListVaults` → all vault records except `TEAM_ACCOUNT_ADDRESS`
- `GetVault` → fetch by `vaultAddress`
- `GetVaultSigners` → fetch vault's access rule (signers + threshold) from Gateway
- `ResyncVault` → refresh on-chain state for a vault

### ProposalsRpc
- `CreateProposal` → compile + normalize manifest, build unsigned partial, run preview, store proposal
- `ListProposals` → query by `vaultAddress`, optional status filter (no pagination for MVP)
- `GetProposal` → pure fetch by id (no mutation)
- `SignProposal` → extract signature from signed partial hex, validate signer against **vault's** access rule, store
- `GetSignatureStatus` → count signatures vs **vault's** threshold
- `SubmitProposal` → compose notarized tx with fee payer, submit to Gateway, return tx hash + 'submitted'
- `RefreshSubmissionStatus` → manual refresh by txId (no polling loop)

### TeamRpc
- `GetTeamSigners` → fetch team account owner rule from Gateway, return signer list + threshold
- `ListMemberSignerSources` → list self-registered member Ed25519 signer sources
- `GetMySignerSource` → return current member's signer source (if set)
- `SetMySignerSource` → upsert current member's signer source (manual entry)
- `ClearMySignerSource` → clear current member's signer source
- `GetTeamStatus` → return owner-rule signer set, registered member signer set, and `signerSetMismatch`
- `GetBadgeResource` → return badge resource address (from env)

```typescript
export const AppRpc = RpcGroup.make(
  ...AuthRpc.requests,
  ...VaultsRpc.requests,
  ...ProposalsRpc.requests,
  ...TeamRpc.requests,
)
```

---

## Key Decisions

| Decision | Choice |
|----------|--------|
| Auth model | Independent per-vault owner-role multisig; no delegated central control |
| Read access | Public read endpoints; auth required for writes |
| Write authorization | Any authenticated member badge holder |
| Groups | Removed — flat vault list |
| Member signer source records | DB table (`member_signer_sources`) populated by self-service member entry |
| HTTP server | `@effect/platform` NodeHttpServer (not Hono) |
| RPC transport | `@effect/rpc` + `@effect/platform` |
| Rendering | SPA only (TanStack Start, no SSR, no Nitro) |
| Tx submission | No background polling — return tx hash + 'submitted' + manual refresh |
| Error model | Per-RPC-group typed error unions |
| Access rules | CountOf + AllOf (flat, no nested) |
| Key types | Access-rule/signature handling supports Ed25519 + Secp256k1; member signer source registration is Ed25519-only |
| Badge type | Fungible, soul-bound, recallable; transfer blocked by withdraw/deposit restrictions |
| Badge minting | Team-authorized mint on member badge resource |
| Vault auth rule changes | Vault-local proposals call `SET_OWNER_ROLE` to change signer set and/or threshold |
| Create vs sign | Separate operations |
| Signing flow | Server returns metadata, client builds SubintentRequestBuilder |
| Submission concurrency | Idempotent (Gateway deduplicates) |
| Fee payer | Small XRD balance, manual top-up |
| Network | Fully configurable (stokenet + mainnet) |
| Manifest builders | Client-side helpers |
| State management | `@effect-atom/atom-react` for everything |
| Pagination | Not for MVP |
| Team UI | Separate section from vault list |
| Team in DB | Team account is a regular vault row matched by `TEAM_ACCOUNT_ADDRESS` |
| Team in list API | Excluded from `ListVaults` response |
| Vault add | Import existing (DB record + verify supported access rule) or create new on-chain with threshold (fee payer signs creation tx, stores DB record) |
| Sessions | DB table, HTTP-only session cookie |
| Session policy | 7-day TTL, sliding refresh only below 50% remaining, single active session per device |
| Badge revocation check | Evaluated at refresh boundary (accepted delay) |
| Signer source requirement | Member must set Ed25519 signer source before signing proposals |
| DB schema derivation | `drizzle-orm/effect-schema` generates Effect schemas from Drizzle tables |
| Schema class preservation | Wrap `createSelectSchema().fields` in `S.Class` for RPC compat |
| Column naming | camelCase JS props, explicit snake_case DB names in Drizzle builders |
| Timestamp overrides | Override with `S.DateFromString` in derived schemas (RPC wire format is ISO string) |
| Raw .ts exports | Standard pnpm/turbo monorepo pattern |
| TS Radix Engine Toolkit | Supports V2 (SubintentManifestV2, PartialTransactionV2) |
| `@radix-effects/gateway` | User's own published library on npm |
| Re-sync | Manual button to refresh vault/team on-chain state |
| Proposal expiry input | `maxProposerTimestampMs` (unix ms), server sets `minProposerTimestamp=now` |
| Proposal preview | Required before create and submit; server runs RET + Gateway preview |
| Preview timeout | Retry once then fail closed |
| Signature duplicates | Idempotent success |
| Submission refresh | Manual `RefreshSubmissionStatus` write RPC (no polling loop) |

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
    "fmt": "oxfmt --write .",
    "fmt:check": "oxfmt --check .",
    "lint": "oxlint",
    "prepare": "husky",
    "db:migrate": "turbo run db:migrate",
    "db:generate": "turbo run db:generate",
    "db:studio": "turbo run db:studio"
  },
  "devDependencies": {
    "husky": "^9.1.7",
    "lint-staged": "^16.2.7",
    "oxlint": "^1.50.0",
    "oxfmt": "^0.35.0",
    "turbo": "^2.6.3",
    "typescript": "5.9.3"
  },
  "packageManager": "pnpm@10.25.0",
  "engines": { "node": ">=22" }
}
```

**`pnpm-workspace.yaml`** with catalog pinning all Effect/Radix/TanStack deps (match consultation_v2 versions).

**`turbo.json`** — same as consultation_v2 (build/lint/check-types cached; dev/test/db:* persistent+uncached).

**`.oxlintrc.json`**:
```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "categories": { "correctness": "warn", "suspicious": "warn" },
  "plugins": ["typescript", "react"],
  "rules": {
    "react/react-in-jsx-scope": "off",
    "require-yield": "off"
  }
}
```

**`.oxfmtrc.json`**:
```json
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "useTabs": false,
  "tabWidth": 2,
  "printWidth": 80,
  "singleQuote": true,
  "trailingComma": "none",
  "semi": false,
  "arrowParens": "always",
  "sortPackageJson": false,
  "ignorePatterns": [".repos", ".output", "*.lock", "*.gen.ts"]
}
```

**`.lintstagedrc`**:
```json
{
  "*.{js,jsx,ts,tsx,mjs,cjs}": ["oxlint", "oxfmt --write"],
  "*.json": "oxfmt --write"
}
```

**`.husky/pre-commit`**:
```sh
pnpm exec lint-staged
pnpm run check-types
pnpm run test
pnpm run build
```

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
TEAM_ACCOUNT_ADDRESS=account_tdx_2_1...
TEAM_MEMBER_BADGE_ADDRESS=resource_tdx_2_1...
FEE_PAYER_PRIVATE_KEY_HEX=...
DAPP_DEFINITION_ADDRESS=account_tdx_2_1...
```

**Files to create:**
- `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.oxlintrc.json`, `.oxfmtrc.json`, `.lintstagedrc`, `.husky/pre-commit`, `.gitignore`
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
  name: varchar('name', { length: 255 }).notNull(),
  accountAddress: varchar('account_address', { length: 255 }).primaryKey(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

Same pattern for all 7 tables:
- `vaults` (PK is `accountAddress`; team row is identified by address match)
- `proposals` (references `vaults.accountAddress`, fields: `vaultAddress`, `manifestText`, `epochMin`, `epochMax`, `subintentHash`, `intentDiscriminator`, `minProposerTimestamp`, `maxProposerTimestamp`, `partialTransactionBytes`, `createdBy`, `createdAt`, `submittedAt`, `txId`, `invalidReason`)
- `signatures` (UNIQUE on `proposalId, signerKeyType, signerKeyHash`, fields: `proposalId`, `signerPublicKey`, `signerKeyType`, `signerKeyHash`, `signatureBytes`, `signedPartialTransactionHex`, `createdAt`)
- `submissionAttempts` (`proposalId`, `feePayerAccount`, `txHash`, `status`, `errorMessage`, `createdAt`)
- `sessions` (`sessionId`, `walletAddress`, `createdAt`, `expiresAt`)
- `challenges` (`challenge`, `expiresAt`)
- `memberSignerSources` (`memberWalletAddress`, `signerPublicKey`, `signerKeyHash`, `createdAt`, `updatedAt`)

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
  'created', 'signing', 'ready',
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
  error: S.Union(/* NotFoundError, UnsupportedAccessRuleError */),
}) {}

export class CreateVault extends Rpc.make('CreateVault')({
  payload: { name: S.String, threshold: S.Number, signers: S.Array(Schemas.Signer) },
  success: Schemas.Vault,
  error: S.Union(/* GatewayError, ManifestCompileError */),
}) {}

// ... ListVaults, GetVault, GetVaultSigners, ResyncVault

export class GetVaultSigners extends Rpc.make('GetVaultSigners')({
  payload: { vaultAddress: S.String },
  success: Schemas.AccessRuleInfo,
  error: S.Union(/* VaultNotFound, GatewayError */),
}) {}

// --- Proposals ---
export class CreateProposal extends Rpc.make('CreateProposal')({
  payload: { vaultAddress: S.String, manifestText: S.String, maxProposerTimestampMs: S.Number },
  success: Schemas.Proposal,
  error: S.Union(/* VaultNotFound, ManifestCompileError */),
}) {}

// ... ListProposals, GetProposal, SignProposal, GetSignatureStatus, SubmitProposal

// --- Team ---
export class GetTeamSigners extends Rpc.make('GetTeamSigners')({
  success: Schemas.AccessRuleInfo,
  error: S.Union(/* GatewayError */),
}) {}

export class ListMemberSignerSources extends Rpc.make('ListMemberSignerSources')({
  success: S.Array(Schemas.Signer),
  error: S.Union(/* UnauthorizedError */),
}) {}

export class GetMySignerSource extends Rpc.make('GetMySignerSource')({
  success: S.NullOr(Schemas.Signer),
  error: S.Union(/* UnauthorizedError */),
}) {}

export class SetMySignerSource extends Rpc.make('SetMySignerSource')({
  payload: { signerPublicKey: S.String },
  success: Schemas.Signer,
  error: S.Union(/* UnauthorizedError, ValidationError */),
}) {}

export class ClearMySignerSource extends Rpc.make('ClearMySignerSource')({
  success: S.Struct({ ok: S.Boolean }),
  error: S.Union(/* UnauthorizedError */),
}) {}

export class GetTeamStatus extends Rpc.make('GetTeamStatus')({
  success: S.Struct({
    ownerRuleSigners: S.Array(Schemas.Signer),
    derivedMemberSigners: S.Array(Schemas.Signer),
    signerSetMismatch: S.Boolean,
  }),
  error: S.Union(/* GatewayError */),
}) {}

export class GetBadgeResource extends Rpc.make('GetBadgeResource')({
  success: S.Struct({ resourceAddress: S.String }),
  error: S.Union(/* ConfigError */),
}) {}

export class RefreshSubmissionStatus extends Rpc.make('RefreshSubmissionStatus')({
  payload: { proposalId: S.Number },
  success: S.Struct({ status: Schemas.ProposalStatus, txId: S.String }),
  error: S.Union(/* ProposalNotFound, GatewayError */),
}) {}

// --- Groups ---
export const AuthRpc = RpcGroup.make(GetChallenge, VerifyRola, GetSession, Logout).prefix('auth')
export const VaultsRpc = RpcGroup.make(ImportVault, CreateVault, ListVaults, GetVault, GetVaultSigners, ResyncVault).prefix('vaults')
export const ProposalsRpc = RpcGroup.make(
  CreateProposal, ListProposals, GetProposal,
  SignProposal, GetSignatureStatus, SubmitProposal, RefreshSubmissionStatus
).prefix('proposals')
export const TeamRpc = RpcGroup.make(
  GetTeamSigners,
  ListMemberSignerSources,
  GetMySignerSource,
  SetMySignerSource,
  ClearMySignerSource,
  GetTeamStatus,
  GetBadgeResource,
).prefix('team')

export const AppRpc = RpcGroup.make(
  ...AuthRpc.requests,
  ...VaultsRpc.requests,
  ...ProposalsRpc.requests,
  ...TeamRpc.requests,
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
  TeamHandler.Default,
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
- `VerifyRola`: look up challenge (verify exists and not expired), delete after use, verify signed challenge proves wallet ownership, check badge balance > 0 via Gateway, create/rotate per-device session in DB, return session cookie

**`apps/server/src/auth/middleware.ts`**:
- RPC middleware that extracts session cookie
- Looks up session in DB → provides `CurrentUser` context tag (wallet address)
- Applied to write RPCs (reads remain public)

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
- `ImportVault` — insert vault record (name + account address), read access rule from Gateway, verify parseable (CountOf/AllOf), store
- `CreateVault` — accept user-selected signers (from discovered members), build manifest (create account + set owner role to CountOf(threshold, signers)), compile, sign with fee payer key, submit to Gateway, extract new account address from transaction receipt, store vault DB record
- `ListVaults` — query all vault rows except the row matching `TEAM_ACCOUNT_ADDRESS`
- `GetVault` — fetch by `vaultAddress`
- `GetVaultSigners` — fetch vault access rule from Gateway → parse access rule → return signers + threshold
- `ResyncVault` — re-fetch on-chain state (balances + access rule)

### Step 5.2: Proposals Handler

**`apps/server/src/handlers/proposals.ts`**:
- `CreateProposal`:
  1. Verify vault exists
  2. Compile manifest (validate + append YIELD_TO_PARENT)
  3. Validate `maxProposerTimestampMs > now` and set `minProposerTimestamp=now`
  4. Build unsigned PartialTransactionV2 with random intent_discriminator
  5. Run preview (RET + Gateway), retry once on timeout, fail closed on error
  6. Store proposal (normalized manifest, subintent_hash, partial_transaction_bytes, timestamp bounds, status: created)
  7. Return proposal

  Supported proposal types include vault auth rule changes (`SET_OWNER_ROLE`) to update signer set and/or threshold.

- `SignProposal`:
  1. Deserialize signed partial hex → extract signature + public key
  2. Hash public key + derive key type → (`key_type`, `key_hash`)
  3. Look up vault for this proposal → fetch **vault's** access rule from Gateway, verify (`key_type`, `key_hash`) is in vault's signer list
  4. Validate subintent hash matches proposal's stored hash
  5. Store signature (UNIQUE constraint handles duplicates)
  6. Count signatures → if >= vault's threshold, update status to 'ready'
  7. If first signature and status was 'created', update to 'signing'
  8. Return SignatureStatus

- `SubmitProposal`:
  1. Verify status is 'ready'
  2. Re-check vault access rule threshold on-chain against collected signatures
  3. Reconstruct signed partial: combine stored unsigned partial + all signatures
  4. Use FeePayerService to compose NotarizedTransactionV2
  5. Run preview (RET + Gateway), retry once on timeout, fail closed on error
  6. Submit to Gateway
  7. Store submission attempt
  8. Update proposal status to 'submitted', store tx_id
  9. Return `{ txId, status: 'submitted' }`

- `ListProposals` — query by `vaultAddress`, optional status filter, no pagination
- `GetProposal` — pure fetch by id (no status/signature mutation)
- `GetSignatureStatus` — count signatures, compare to vault's threshold
- `RefreshSubmissionStatus` — query by `txId`, update proposal status to `committed`/`failed` where applicable

### Step 5.3: Auth Handler

**`apps/server/src/handlers/auth.ts`**:
- `GetChallenge` → generate + store challenge
- `VerifyRola` → verify ROLA proof, check badge, create session
- `GetSession` → return current session from cookie
- `Logout` → delete session from DB

### Step 5.4: Team Handler

**`apps/server/src/handlers/team.ts`**:
- `GetTeamSigners` → fetch team owner-rule access rule from Gateway, parse, return signer list + threshold
- `ListMemberSignerSources` → list DB rows from `member_signer_sources`
- `GetMySignerSource` → fetch current member's signer source row
- `SetMySignerSource` → validate Ed25519 input, derive key hash, upsert current member's row
- `ClearMySignerSource` → delete current member's row (self-service)
- `GetTeamStatus` → compare owner-rule signer set vs registered member signer set, return `signerSetMismatch`
- `GetBadgeResource` → return `TEAM_MEMBER_BADGE_ADDRESS` from env

### Step 5.5: Validity & Status Updates

- `GetProposal` remains read-only.
- `SubmitProposal` enforces current signer/threshold validity; if checks fail, mark proposal `invalid`.
- `RefreshSubmissionStatus` is explicit write action for submitted tx status reconciliation.

**Files to create:**
- `apps/server/src/handlers/vaults.ts`
- `apps/server/src/handlers/proposals.ts`
- `apps/server/src/handlers/auth.ts`
- `apps/server/src/handlers/team.ts`

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
- `vaultDetailAtom(vaultAddress)`

**`apps/client/src/atom/proposals.ts`**:
- `proposalsListAtom(vaultAddress, status?)` — fetches proposals
- `proposalDetailAtom(id)` — fetches proposal (read-only)
- `createProposalAtom` — creates proposal via RPC
- `signatureStatusAtom(proposalId)` — fetches signature progress
- `refreshSubmissionStatusAtom(proposalId)` — manual tx status refresh via RPC

**`apps/client/src/atom/signing.ts`**:
- `handleSignAtom(proposalDetailAtom, sigStatusAtom)`:
  1. Get RDT instance
  2. Require member signer source is set (`GetMySignerSource`) — block if missing
  3. Build SubintentRequestBuilder with proposal's header values
  4. Call `rdt.walletApi.sendPreAuthorizationRequest()`
  5. Validate returned subintent hash matches expected
  6. Send signed partial to server via `SignProposal` RPC
  7. Refresh atoms

**`apps/client/src/atom/submit.ts`**:
- `submitProposalAtom(proposalId)` — calls `SubmitProposal` RPC

**`apps/client/src/atom/vaultSigners.ts`**:
- `vaultSignersAtom(vaultAddress)` — fetches vault's access rule (signers + threshold) via `GetVaultSigners` RPC

**`apps/client/src/atom/team.ts`**:
- `teamSignersAtom` — fetches team owner-rule signers via `GetTeamSigners` RPC
- `memberSignerSourcesAtom` — fetches registered member signer sources via `ListMemberSignerSources` RPC
- `mySignerSourceAtom` — fetches current member signer source via `GetMySignerSource`
- `setMySignerSourceAtom` — upserts current member signer source via `SetMySignerSource`
- `clearMySignerSourceAtom` — clears current member signer source via `ClearMySignerSource`
- `teamStatusAtom` — fetches signer-set mismatch status via `GetTeamStatus` RPC
- `badgeResourceAtom` — fetches badge resource address

### Step 6.5: Manifest Builders (Client-Side)

**`apps/client/src/lib/manifest.ts`**:
- `buildSetOwnerRoleManifest({ vaultAddress, signers, threshold })` — used by `/vaults/$vaultAddress/auth-rules`, sets vault owner role with `SET_OWNER_ROLE` to CountOf(threshold, signers)
- `buildMintBadgeManifest({ badgeResource, recipientAddress })` — mint 1 badge + deposit
- `buildRecallBadgeManifest({ targetAccount, badgeResource })` — recall + burn membership badge
- `buildChangeSignersManifest({ accountAddress, signers, threshold })` — change owner role on the target vault account
- `buildTransferManifest({ fromAccount, toAccount, resourceAddress, amount })` — basic transfer (non-member resources only)

### Step 6.6: shadcn/ui Setup

Run `npx shadcn@latest init` in `apps/client/`. Install components as needed:
- Button, Card, Input, Label, Select, Dialog, Badge, Table, Tabs, Separator, Sonner (toast)

### Step 6.7: Routes & Pages

File-based routing under `apps/client/src/routes/`:

**`__root.tsx`** — Root layout with sidebar nav + wallet connect button.

**`index.tsx`** — Dashboard: vault list + pending proposal counts.

**`vaults/add.tsx`** — Add vault form with import/create toggle: import mode enters account address + name (any parseable access rule accepted); create mode enters name + threshold + signer picker (from discovered members), server creates on-chain account.

**`vaults/$vaultAddress.tsx`** — Vault detail: balance, current threshold + signers, proposals list (filterable by status), create proposal button, change vault auth rules action, warning badge for signers not in known members.

**`vaults/$vaultAddress/auth-rules.tsx`** — Dedicated flow to change vault auth rules (signer set and/or threshold) by building a `SET_OWNER_ROLE` proposal.

**`vaults/$vaultAddress/proposals/new.tsx`** — Create proposal form: manifest text editor, max expiry timestamp (unix ms / hours input).

**`vaults/$vaultAddress/proposals/$proposalId.tsx`** — Proposal detail: status badge, manifest text, signature progress (collected/threshold), per-signer table, sign button, submit button, tx ID link.

**`team/index.tsx`** — Team section: owner-rule signers + threshold, registered member signer sources, signer-set mismatch warning, badge resource info, re-sync button.

**`team/badges.tsx`** — Badge management: mint (enter account address), recall + burn membership badge.

**`team/signers.tsx`** — Team signer management: view current team owner-rule signers (vault signer changes remain vault-local).

**`team/proposals.tsx`** — Team proposals list (badge mint/recall + team owner-role updates).

### Step 6.8: Key UI Components

**`src/components/layout/Sidebar.tsx`** — Vault nav, team section, user info, wallet connect.

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
- `apps/client/src/atom/vaultSigners.ts`, `apps/client/src/atom/team.ts`
- All route files under `apps/client/src/routes/`
- All component files under `apps/client/src/components/`

---

## Phase 7: Server — Radix Integration (Transaction Building)

### Step 7.1: Subintent Builder

**`apps/server/src/manifest/subintentBuilder.ts`**:
- Uses `@radixdlt/radix-engine-toolkit` (TypeScript WASM, supports V2)
- Builds unsigned PartialTransactionV2 from:
  - Compiled manifest instructions
  - IntentHeaderV2 (network_id, epoch bounds, random discriminator, proposer timestamps)
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
- Extracts Ed25519 or Secp256k1 signature + public key from root_subintent_signatures
- Computes key_hash (blake2b of public key) and key_type
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
2. Create team multisig account on-chain (CountOf threshold + signer virtual badges)
3. Create recallable soul-bound fungible badge resource with mint+recall authority on team account and transfer-preventing withdraw/deposit restrictions
4. Mint initial badges to specified recipient addresses
5. Output env var values:
   ```
   TEAM_ACCOUNT_ADDRESS=account_tdx_2_1...
   TEAM_MEMBER_BADGE_ADDRESS=resource_tdx_2_1...
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
- Verify insert schemas (`VaultInsert`, `ProposalInsert`) reject auto-generated fields (`createdAt`, plus `id` where applicable)
- Validation edge cases (empty strings, malformed addresses)
- ProposalStatus enum validation

### Step 9.2: Server Integration Tests

Use `@testcontainers/postgresql` for real Postgres.

**`apps/server/src/__tests__/vaults.test.ts`**:
- Import vault → reads access rule, stores record
- Create vault with threshold → creates on-chain account with CountOf(threshold, signers) + stores record
- List vaults → excludes the team row (`TEAM_ACCOUNT_ADDRESS`)
- Get vault signers → returns vault's access rule
- Re-sync vault
- Different vaults can have different thresholds

**`apps/server/src/__tests__/proposals.test.ts`**:
- Full lifecycle: create → sign → threshold met → submit
- Duplicate signature idempotent success (UNIQUE constraint)
- Invalid signer rejection (not in vault's access rule)
- Signer validation against vault's threshold (not team account)
- Timestamp expiry detection
- Status transitions
- Create/submit require successful preview

**`apps/server/src/__tests__/team.test.ts`**:
- `GetTeamSigners` returns team owner-rule signer set
- `SetMySignerSource` upserts exactly one Ed25519 signer source per member
- `SignProposal` is blocked when member signer source is missing
- Team status returns `signerSetMismatch` when owner-rule and registered member sets differ
- Badge transfer attempt fails due to withdraw/deposit restrictions
- Team recall + burn succeeds for membership removal

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
- `apps/server/src/__tests__/team.test.ts`
- `apps/server/src/__tests__/auth.test.ts`
- `apps/server/src/__tests__/manifest.test.ts`
- `apps/server/src/__tests__/accessRuleParser.test.ts`

---

## Execution Order

1. **Phase 1** — Monorepo scaffold (config files only)
2. **Phase 2** — Database schema + ORM services
3. **Phase 3** — Shared schemas + RPC definitions
4. **Phase 4** — Server core services (auth/ROLA, gateway client, fee payer, manifest compiler)
5. **Phase 5** — Server RPC handlers (vaults, proposals, auth, team)
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
