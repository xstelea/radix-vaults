# @radix-effects/tx-tool — Deep Analysis

## Overview

`@radix-effects/tx-tool` is a production-grade Effect.js service layer for the Radix V1 transaction lifecycle (~900 LOC). It builds, signs, compiles, submits, and polls transactions via composable Effect.Service definitions.

Key properties:

- **Effect.Service pattern throughout** — 13 services + 2 Context.Tags, each independently testable and composable
- **Signer abstraction** — HashiCorp Vault transit API (production) + Ed25519 private key (dev/test)
- **Schema validation via Effect.Schema** — all domain types validated at boundaries
- **Lifecycle hooks for observability** — onSubmit / onSubmitSuccess / onStatusFailure / onSuccess
- **Exponential backoff polling** — bounded retry for transaction status confirmation
- **All config via `Effect.Config`** — not `process.env`; 7 config keys with sensible defaults

**Source:** `.repos/radix-web3.js/packages/tx-tool/src/` (15 files + manifests/ + signer/ + test-helpers/)
**Dependencies:** `effect`, `@effect/platform`, `@effect/platform-node`, `@radix-effects/gateway`, `@radix-effects/shared`, `@radixdlt/radix-engine-toolkit` (v1.0.5), `@radixdlt/babylon-core-api-sdk`, `@radixdlt/babylon-gateway-api-sdk`, `@noble/curves`, `@noble/hashes`, `bignumber.js`

---

## Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │         TransactionHelper (facade)           │
                  │                                              │
                  │  submitTransaction  faucet  createBadge      │
                  │  createFungibleToken  getCommittedDetails    │
                  └──────┬──────────────────────────┬────────────┘
                         │                          │
       ┌─────────────────┼───────────┐    ┌────────┼────────────┐
       ▼                 ▼           ▼    ▼        ▼            ▼
  ┌─────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────┐ ┌────────┐
  │Create   │  │Compile       │  │Submit    │  │Tx Status │ │Intent  │
  │TxIntent │  │Transaction   │  │Tx       │  │(poll)    │ │Hash    │
  └────┬────┘  └──────┬───────┘  └────┬────┘  └────┬─────┘ └────────┘
       │              │               │             │
  ┌────┴────┐  ┌──────┴───────┐       │             │
  │Tx Header│  │NotaryKeyPair │       │             │
  │Validate │  └──────┬───────┘       │             │
  │Manifest │         │               │             │
  └────┬────┘         │               │             │
       │              │               │             │
  ┌────┴──────────────┴───────────────┴─────────────┘
  │
  ▼
  ┌──────────────────┐     ┌─────────────────────────┐
  │ GatewayApiClient │     │ Signer (Context.Tag)    │
  │ GetLedgerState   │     │  ├─ VaultLive (prod)    │
  │ GetFungibleBal.  │     │  └─ makePrivateKey (dev)│
  └──────────────────┘     └─────────────────────────┘
```

**Dependency flow:** `TransactionHelper.Default` auto-wires all 9 declared dependencies transitively. Composite services declare `dependencies: [X.Default]` so Effect's Layer system handles the tree.

---

## Transaction Lifecycle (V1)

```
Manifest (string)
    │
    ▼
CreateTransactionIntent
    │  reads: TransactionHeader (epoch, nonce, notary key)
    │  validates: StaticallyValidateManifest
    │  decodes: ManifestSchema, TransactionMessageSchema
    │
    ▼
TransactionIntent { header, message, manifest }
    │
    ▼
IntentHashService.create(intent)
    │  RadixEngineToolkit.Intent.hash()
    │
    ▼
{ id: TransactionId, hash: HexString }
    │
    ▼
Signer.signToSignatureWithPublicKey(hash)
    │  VaultLive: POST /v1/transit/sign/{keyName}
    │  PrivateKey: ed25519.sign() via @noble/curves
    │
    ▼
Ed25519SignatureWithPublicKey[]
    │
    ▼
CompileTransaction({ intent, signatures })
    │  TransactionBuilder → header → message → manifest → sign → notarizeAsync
    │  RadixEngineToolkit.NotarizedTransaction.compile()
    │
    ▼
Uint8Array (compiled notarized transaction bytes)
    │
    ▼
SubmitTransaction
    │  gateway.transaction.innerClient.transactionSubmit()
    │
    ▼
TransactionStatus.poll({ id })
    │  exponential backoff: 100ms base, 10 attempts, 1min timeout
    │  retries on: TransactionNotResolvedError
    │  fails on: TransactionFailedError, TimeoutError
    │
    ▼
TransactionStatusResponse (CommittedSuccess)
```

---

## Service Catalog

| Service | Pattern | Input | Output | Dependencies | Config |
|---------|---------|-------|--------|--------------|--------|
| `TransactionHelper` | Effect.Service | `{ manifest, feePayer?, transactionIntent? }` | `{ statusResponse, id }` | CreateTxIntent, CompileTx, SubmitTx, TxStatus, ManifestHelper, IntentHash, Epoch, GetFungibleBalance, GetLedgerState | -- |
| `CreateTransactionIntent` | Effect.Service | `{ manifest, startEpochInclusive?, endEpochExclusive?, message?, tipPercentage? }` | `TransactionIntent` | StaticallyValidateManifest, TransactionHeader | -- |
| `TransactionHeader` | Effect.Service | `{ networkId, startEpochInclusive: Option<Epoch>, endEpochExclusive: Option<Epoch>, tipPercentage?, nonce?, notaryIsSignatory? }` | `TransactionHeader` (schema) | GetLedgerState, NotaryKeyPair, EpochService | -- |
| `CompileTransaction` | Effect.Service | `{ intent: TransactionIntent, signatures: Ed25519Sig[] }` | `Uint8Array` | NotaryKeyPair | -- |
| `SubmitTransaction` | Effect.Service | `{ compiledTransaction: Uint8Array }` | `TransactionSubmitResponse` | GatewayApiClient | -- |
| `TransactionStatus` | Effect.Service | `{ id, retryPolicy?, timeout? }` | `TransactionStatusResponse` | GatewayApiClient | 3 keys (see Config) |
| `PreviewTransaction` | Effect.Service | `{ payload: TransactionPreviewOperationRequest['transactionPreviewRequest'] }` | `TransactionPreviewResponse` | GatewayApiClient | -- |
| `IntentHashService` | Effect.Service | `TransactionIntent` | `{ id: TransactionId, hash: HexString }` | -- | -- |
| `EpochService` | Effect.Service | -- | `{ getCurrentEpoch, verifyEpochBounds }` | GetLedgerState | -- |
| `NotaryKeyPair` | Effect.Service | -- | `{ publicKey, signToSignature }` | Signer | -- |
| `StaticallyValidateManifest` | Effect.Service | `{ manifest: Manifest, networkId }` | `void` (or error) | -- | -- |
| `ManifestHelper` | Effect.Service | -- | `{ addFeePayer }` | -- | -- |
| `Vault` | Effect.Service | `HexString` (hash) | signature + public key | NodeHttpClient, NodeFileSystem | 4 keys (see Config) |
| `Signer` | Context.Tag | `HexString` (hash) | `Ed25519SignatureWithPublicKey[]` | (provided via Layer) | Vault: 4 keys |
| `TransactionLifeCycleHook` | Context.Tag | -- | `{ onSubmit?, onSubmitSuccess?, onStatusFailure?, onSuccess? }` | -- | -- |

---

## Core Types

### TransactionIntent

```typescript
type TransactionIntent = {
  header: TransactionHeader;
  message: TransactionMessage;  // PlainText | None
  manifest: Manifest;
}
```

### TransactionHeader

```typescript
type TransactionHeader = {
  networkId: NetworkId;
  startEpochInclusive: Epoch;
  endEpochExclusive: Epoch;
  notaryPublicKey: PublicKey.Ed25519;
  nonce: Nonce;
  notaryIsSignatory: boolean;
  tipPercentage: number;
}
```

### Manifest

```typescript
type Manifest = {
  instructions: { kind: 'String'; value: TransactionManifestString };
  blobs: Uint8Array[];
}
// Encoded form = TransactionManifestString (decoded via ManifestSchema)
```

### TransactionMessage

```typescript
type TransactionMessage =
  | { kind: 'PlainText'; value: { message: { kind: 'String'; value: TransactionMessageString }; mimeType: 'text/plain' } }
  | { kind: 'None' }
// Encoded form = TransactionMessageString | undefined
```

### Ed25519SignatureWithPublicKey

```typescript
// Encoded:
{ signature: HexString; signerPublicKey: HexString; curve: 'Ed25519' }
// Decoded: SignatureWithPublicKey.Ed25519 instance (from RET)
```

### Badge

```typescript
// BadgeSchema / BadgeDecodedSchema defined in schemas.ts
// Represents a fungible resource badge
```

### Conversion Schemas

| Schema | From | To | Purpose |
|--------|------|----|---------|
| `Base64FromHexSchema` | `HexString` | `Base64String` | Vault API expects base64 input |
| `HexFromBase64Schema` | `Base64String` | `HexString` | Vault API returns base64 sigs |
| `Ed25519PublicKeySchema` | `HexString` | `PublicKey.Ed25519` | RET interop |
| `Ed25519PrivateKeySchema` | `HexString` | `PrivateKey.Ed25519` | RET interop |

### Branded Types (from `@radix-effects/shared`)

All validated via Effect.Schema:

- `AccountAddress` — branded string for account addresses
- `Amount` — branded string for token amounts
- `HexString` — branded string for hex-encoded data
- `Base64String` — branded string for base64-encoded data
- `TransactionManifestString` — branded string for transaction manifests
- `TransactionMessageString` — branded string for transaction messages
- `NetworkId` — branded number for network identification
- `Epoch` — branded number for epoch values
- `Nonce` — branded number for transaction nonces
- `TransactionId` — branded string for transaction IDs
- `FungibleResourceAddress` — branded string for fungible resource addresses
- `NonFungibleId` — branded string for NFT identifiers
- `NonFungibleResourceAddress` — branded string for NFT resource addresses
- `PackageAddress` — branded string for package addresses
- `ComponentAddress` — branded string for component addresses
- `AccessControllerAddress` — branded string for access controller addresses

---

## Signer Module

### Interface

```typescript
class Signer extends Context.Tag('Signer')<Signer, {
  signToSignatureWithPublicKey: (hash: HexString)
    => Effect<Ed25519SignatureWithPublicKey[], FailedToSignTransactionError>;
  publicKey: () => Effect<PublicKey>;
}>()
```

### VaultLive (Production)

Uses HashiCorp Vault transit API. Reads token from file (`VAULT_TOKEN_FILE`) or env (`VAULT_TOKEN`). Self-signed cert support via `rejectUnauthorized: false`. HTTP retry with exponential backoff (3 retries, 100ms base).

Key operations:
- `GET /v1/transit/keys/{keyName}` -> public key (base64 -> hex)
- `POST /v1/transit/sign/{keyName}` -> signature (`vault:v1:base64` -> hex)

Dependencies: `NodeHttpClient` (with custom agent), `NodeFileSystem`

Token is read from file on every signing request (supports Vault Agent token renewal).

### makePrivateKeySigner (Development/Test)

Direct Ed25519 signing via `@noble/curves`. Takes `Redacted<HexString>` private key. No network calls. Synchronous operation wrapped in Effect.

```typescript
static makePrivateKeySigner = (privateKey: Redacted.Redacted<HexString>)
  => Layer.Layer<Signer>
```

---

## Manifest Helpers

| Helper | Input | Output | Notes |
|--------|-------|--------|-------|
| `faucet(address)` | `AccountAddress` | `TransactionManifestString` | Testnet only (network_id=2 hardcoded via `RadixEngineToolkit.Utils.knownAddresses(2)`) |
| `createBadge(account, supply?)` | `Account`, `number` (default: 1) | `TransactionManifestString` | Fungible, 0 decimals, DenyAll except withdraw/recall (AllowAll), metadata: name="Badge" |
| `createFungibleTokenManifest(input)` | `{ name, symbol, initialSupply, account }` | `TransactionManifestString` | 0 decimals, DenyAll except withdraw (AllowAll), deposits to account |
| `addFeePayer(input)` | `{ account: Account, amount: Amount }` | `TransactionManifestString` | Handles secured + unsecured accounts (pure function) |
| `ManifestHelper.addFeePayer(input)` | `{ account: Account, amount: Amount }` | `Effect<TransactionManifestString>` | Effect-wrapped version of above |

**Secured vs unsecured fee payer:**
- **Unsecured:** single `CALL_METHOD lock_fee` on account component
- **Secured:** `create_proof` on `accessControllerAddress`, then `lock_fee`

---

## Error Types

All use `Data.TaggedError` from Effect.

| Error | `_tag` | Source | Fields |
|-------|--------|--------|--------|
| `InvalidStartEpochError` | `'InvalidStartEpochError'` | `epoch.ts` | `message`, `transactionId` |
| `InvalidEndEpochError` | `'InvalidEndEpochError'` | `epoch.ts` | `message`, `transactionId` |
| `InvalidEpochError` | `'InvalidEpochError'` | `transactionHeader.ts` | `message` |
| `FailedToCreateIntentHashError` | `'FailedToCreateIntentHashError'` | `intentHash.ts` | `error: unknown` |
| `FailedToNotarizeTransactionError` | `'FailedToNotarizeTransactionError'` | `compileTransaction.ts` | `error: unknown` |
| `FailedToCompileTransactionError` | `'FailedToCompileTransactionError'` | `compileTransaction.ts` | `error: unknown` |
| `TransactionPreviewError` | `'TransactionPreviewError'` | `previewTransaction.ts` | `message?: string` |
| `TransactionFailedError` | `'TransactionFailedError'` | `transactionStatus.ts` | `status`, `statusDescription`, `message`, `transactionId` |
| `TransactionNotResolvedError` | `'TransactionNotResolvedError'` | `transactionStatus.ts` | `status`, `statusDescription`, `message`, `transactionId` |
| `TimeoutError` | `'TimeoutError'` | `transactionStatus.ts` | `transactionId` |
| `FailedToSignTransactionError` | `'FailedToSignTransactionError'` | `signer.ts` | `error: unknown` |
| `InvalidManifestError` | `'InvalidManifestError'` | `staticallyValidateManifest.ts` | `message` |
| `FailedToStaticallyValidateManifestError` | `'FailedToStaticallyValidateManifestError'` | `staticallyValidateManifest.ts` | `error: unknown` |
| `InsufficientXrdBalanceError` | `'InsufficientXrdBalanceError'` | `transactionHelper.ts` | `message` |
| `FaucetNotAvailableError` | `'FaucetNotAvailableError'` | `transactionHelper.ts` | `message` |

---

## Configuration

All config is read via `Effect.Config` — never directly from `process.env`.

| Config Key | Default | Used By |
|------------|---------|---------|
| `TRANSACTION_STATUS_POLL_TIMEOUT` | `Duration.minutes(1)` | TransactionStatus |
| `TRANSACTION_STATUS_MAX_POLL_ATTEMPTS_COUNT` | `10` | TransactionStatus |
| `TRANSACTION_STATUS_POLL_DELAY` | `Duration.millis(100)` | TransactionStatus |
| `VAULT_BASE_URL` | `'http://localhost:8200'` | Vault |
| `VAULT_KEY_NAME` | `'xrd-distribution'` | Vault |
| `VAULT_TOKEN_FILE` | -- (optional, priority over VAULT_TOKEN) | Vault |
| `VAULT_TOKEN` | -- (required if no file) | Vault |

TransactionStatus uses exponential backoff:
```typescript
Schedule.exponential(pollDelay).pipe(
  Schedule.compose(Schedule.recurs(maxPollAttempts))
)
```

---

## Lifecycle Hooks

```typescript
class TransactionLifeCycleHook extends Context.Tag('TransactionLifeCycleHook')<
  TransactionLifeCycleHook,
  {
    onSubmit?: ({ id, intent }) => Effect<void>;
    onSubmitSuccess?: ({ id, intent }) => Effect<void>;
    onStatusFailure?: ({ id, permanent, intent }) => Effect<void>;
    onSuccess?: ({ id }) => Effect<void>;
  }
>()
```

Optional Context.Tag. Retrieved via `Effect.serviceOption` -- not required in the dependency tree. TransactionHelper checks each hook via `Option.flatMap` at the four lifecycle points. The `permanent` flag on `onStatusFailure` is `true` only when error `_tag === 'TransactionFailedError'`.

**Hook timing:**

```
submitTransaction(manifest)
    │
    ├─ [onSubmit]          <- before gateway submit
    │
    ├─ gateway.submit()
    │
    ├─ [onSubmitSuccess]   <- after gateway accepts
    │
    ├─ poll() loop
    │   ├─ CommittedSuccess -> [onSuccess]
    │   └─ Failed/Timeout  -> [onStatusFailure]
    │
    ▼
return { statusResponse, id }
```

---

## V2 Transaction Model (Not Supported)

tx-tool is **V1-only**. It uses `TransactionBuilder` from `@radixdlt/radix-engine-toolkit` v1.0.5. V2 support would require upgrading the toolkit and adding new services. This section documents the V2 model for context on what is missing and the upgrade path.

### V2 Structure

```
NotarizedTransactionV2
├── SignedTransactionIntentV2
│   ├── TransactionIntentV2
│   │   ├── TransactionHeaderV2
│   │   ├── IntentCoreV2 (root intent)
│   │   │   ├── IntentHeaderV2
│   │   │   ├── BlobsV1
│   │   │   ├── MessageV2
│   │   │   ├── ChildSubintentSpecifiersV2
│   │   │   └── InstructionsV2
│   │   └── NonRootSubintentsV2 (Vec<SubintentV2>, flattened)
│   ├── IntentSignaturesV2 (for root intent)
│   └── NonRootSubintentSignaturesV2 (one IntentSignaturesV2 per subintent)
└── NotarySignatureV2
```

### TransactionHeaderV2 vs V1

| Field | V1 | V2 |
|-------|----|----|
| `notary_public_key` | `PublicKey` | `PublicKey` |
| `notary_is_signatory` | `bool` | `bool` |
| `tip` | `tip_percentage: u16` (0-65535%) | `tip_basis_points: u32` (0-1,000,000) |
| `network_id` | in header | moved to `IntentHeaderV2` |
| `epochs` | in header | moved to `IntentHeaderV2` |
| `nonce` | `u32` in header | replaced by `intent_discriminator: u64` per intent |
| `timestamps` | not supported | `min_proposer_timestamp_inclusive`, `max_proposer_timestamp_exclusive` |

### IntentHeaderV2 (per-intent)

```rust
pub struct IntentHeaderV2 {
    pub network_id: u8,
    pub start_epoch_inclusive: Epoch,
    pub end_epoch_exclusive: Epoch,
    pub intent_discriminator: u64,  // replaces nonce; random for uniqueness
    pub min_proposer_timestamp_inclusive: Option<Instant>,
    pub max_proposer_timestamp_exclusive: Option<Instant>,
}
```

### SubintentV2

Simply wraps an `IntentCoreV2`:
```rust
pub struct IntentCoreV2 {
    pub header: IntentHeaderV2,
    pub blobs: BlobsV1,
    pub message: MessageV2,
    pub children: ChildSubintentSpecifiersV2,
    pub instructions: InstructionsV2,
}
```

### Partial Transactions

```
SignedPartialTransactionV2
├── PartialTransactionV2
│   ├── root_subintent: SubintentV2
│   └── non_root_subintents: NonRootSubintentsV2
├── root_subintent_signatures: IntentSignaturesV2
└── non_root_subintent_signatures: NonRootSubintentSignaturesV2
```

### V2-Exclusive Instructions

| Instruction | ID | Purpose |
|-------------|---:|---------|
| `YieldToParent` | 0x60 | Return control to parent intent |
| `YieldToChild` | 0x61 | Invoke child subintent |
| `VerifyParent` | 0x62 | Assert parent matches access rule |
| `AssertWorktopResourcesOnly` | 0x09 | Assert worktop contains only specified resources |
| `AssertWorktopResourcesInclude` | 0x0A | Assert worktop includes specified resources |
| `AssertNextCallReturnsOnly` | 0x0B | Assert next call returns only specified resources |
| `AssertNextCallReturnsInclude` | 0x0C | Assert next call includes specified resources |
| `AssertBucketContents` | 0x0D | Assert bucket contains specific resources |

### Builder Patterns (Rust)

```rust
// Full V2 transaction
TransactionV2Builder::new()
    .transaction_header(TransactionHeaderV2 { ... })
    .intent_header(IntentHeaderV2 { ... })
    .add_signed_child("child_name", signed_partial)  // children FIRST
    .manifest_builder(|builder| { ... })              // root manifest
    .sign(&signer_key)
    .notarize(&notary_key)
    .build()  // -> DetailedNotarizedTransactionV2

// Partial transaction (subintent subtree)
PartialTransactionV2Builder::new()
    .intent_header(IntentHeaderV2 { ... })
    .add_signed_child("child_name", child_signed_partial)
    .manifest_builder(|builder| { ... })
    .sign(&signer_key)
    .build()  // -> DetailedSignedPartialTransactionV2
```

### V2 Validation Constraints

- Max subintent depth: **3** (+ root = 4 levels)
- Max subintents per transaction: **32**
- Max child subintents per intent: **32**
- Max signer signatures per intent: **16**
- Max total signature validations: **64**
- **V2 notary cannot duplicate signer** (forbidden; V1 allowed it)
- Every subintent must end with `YIELD_TO_PARENT`
- `YIELD_TO_CHILD` count must match `YIELD_TO_PARENT` count per pair

### connect Package SubIntent Support

The `connect` package already defines wallet interaction types for subintents:

```typescript
SubintentRequestItem = {
  discriminator: 'subintent',
  version: number,
  manifestVersion: number,
  subintentManifest: string,
  blobs?: string[],
  message?: string,
  expiration: ExpireAtTime | ExpireAfterDelay
}

SubintentResponseItem = {
  expirationTimestamp: number,
  subintentHash: string,
  signedPartialTransaction: string  // hex-encoded
}
```

This handles the wallet RPC for signing subintents but NOT the transaction building/aggregation flow.

---

## Usage Patterns

### Basic Transaction Submission

```typescript
const program = Effect.gen(function* () {
  const helper = yield* TransactionHelper;
  const result = yield* helper.submitTransaction({
    manifest: TransactionManifestString.make(`...`),
    feePayer: { account: myAccount, amount: Amount.make('10') },
  });
  return result.id;
});

program.pipe(
  Effect.provide(TransactionHelper.Default),
  Effect.provide(Signer.makePrivateKeySigner(key)),
  Effect.runPromise,
);
```

### Pre-built Transaction Intent

```typescript
const result = yield* helper.submitTransaction({
  manifest: TransactionManifestString.make(`...`),
  transactionIntent: prebuiltIntent, // skips header creation, validates epoch
});
```

### Faucet (Testnet Only)

```typescript
yield* helper.faucet({ account: myAccount });
// Dies with FaucetNotAvailableError on mainnet (networkId === 1)
```

### With Lifecycle Hooks

```typescript
const hooks = TransactionLifeCycleHook.of({
  onSubmit: ({ id }) => Effect.log(`Submitting ${id}`),
  onSuccess: ({ id }) => Effect.log(`Confirmed ${id}`),
  onStatusFailure: ({ id, permanent }) =>
    Effect.log(`Failed ${id}, permanent=${permanent}`),
});

program.pipe(
  Effect.provideService(TransactionLifeCycleHook, hooks),
);
```

---

## Test Helpers

### createAccount

```typescript
createAccount(input?: { privateKey?: Uint8Array; networkId?: number })
  => Effect<{
    address: AccountAddress;
    sign: (hash: string) => string; // hex signature
    publicKeyHex: string;
    privateKeyHex: string;
  }>
```

Generates Ed25519 keypair via `@noble/curves`, derives virtual account address via `RadixEngineToolkit`. Default `networkId` is `1` (override to `2` for stokenet tests).

### DisableTestClock

```typescript
DisableTestClock: <A, E, R>(effect: Effect<A, E, R>) => Effect<A, E, R>
```

Workaround for Effect.js TestClock: forks effect, polls Fiber via real `setTimeout`, adjusts TestClock by 1 second on each iteration until fiber completes. Required because Effect TestClock freezes time, blocking `Duration`-based operations like `TransactionStatus` polling.

---

## Gotchas

### 1. Signer Is a Context.Tag, Not Effect.Service

Signer uses `Context.Tag` (not `Effect.Service`) -- no `.Default` layer. Must be explicitly provided via `Signer.VaultLive` or `Signer.makePrivateKeySigner()`. TransactionHelper declares no dependency on Signer, but it yields Signer internally -- the `R` type propagates through the effect system.

### 2. NotaryKeyPair Reuses the Same Signer

NotaryKeyPair wraps the same Signer Context.Tag. The notary and the signer are the same key. No separate notary key configuration.

### 3. Faucet Hardcodes Network ID 2

`faucet` manifest calls `RadixEngineToolkit.Utils.knownAddresses(2)` -- hardcoded to stokenet. `TransactionHelper.faucet()` guards against mainnet (`networkId === 1`) via `Effect.die`.

### 4. Fee Payer Balance Check Uses Current Timestamp

`submitTransaction` queries ledger state at `{ timestamp: new Date() }` for balance validation. This races with the actual submission -- balance could change between check and commit.

### 5. CompileTransaction Errors Are Die'd

In `submitTransaction`, `compileTransaction` errors are caught with `Effect.catchAll(Effect.die)` -- they become defects, not recoverable failures. Same for `ParseError` and `InvalidEpochError` during intent creation.

### 6. TransactionStatus Retry Is Bounded

Unlike Gateway's unbounded 429 retry, TransactionStatus has a hard cap: `recurs(maxPollAttempts)` composed with exponential backoff, plus a timeout. After exhausting retries on `TransactionNotResolvedError`, it fails. `TransactionFailedError` is NOT retried.

### 7. Vault Token Refresh Is Per-Request

`getVaultToken` reads the token file on every signing request. This supports Vault Agent token renewal but means file I/O on every transaction.

### 8. Lifecycle Hook Is Optional via serviceOption

`TransactionLifeCycleHook` uses `Effect.serviceOption`, not `yield*`. If not provided, all hooks silently no-op. No error if missing.

### 9. V2 Requires radix-engine-toolkit Upgrade

V2 transaction support (`TransactionV2Builder`, `PartialTransactionV2Builder`, subintent composition) requires upgrading from `@radixdlt/radix-engine-toolkit` v1.0.5 to a later version. The `connect` package already has wallet-level subintent types but tx-tool has no V2 building/aggregation logic.
