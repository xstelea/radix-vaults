# TypeScript Radix Engine Toolkit Reference

Technical reference for `@steleaio/radix-engine-toolkit` (v2.0.0-dev.3) — the TypeScript wrapper around the Rust WASM core. Complements `radix-transactions.md` (Rust crate) with TS-specific API surface, builder patterns, and model types.

**Package:** `@steleaio/radix-engine-toolkit`
**License:** Apache-2.0
**Module formats:** UMD (`dist/radix-engine-toolkit.umd.js`), ESM (`dist/radix-engine-toolkit.mjs`)
**Types:** `dist/index.d.ts`
**Build tool:** Vite + `@rollup/plugin-wasm` (WASM inlined at build time)

**Key runtime deps:** `@noble/ed25519`, `@noble/hashes`, `secp256k1`, `blakejs`, `decimal.js` (precision: 64), `change-case`, `reflect-metadata`

**Entry point** re-exports: `./builder`, `./convert`, `./exceptions`, `./lts`, `./models`, `./network`, `./utils`, `./wasm`

---

## Architecture — WASM Loading Stack

```
┌─────────────────────────────┐
│  RadixEngineToolkit          │  High-level static async API
├─────────────────────────────┤
│  RawRadixEngineToolkit       │  Typed WASM function bindings (singleton Promise)
├─────────────────────────────┤
│  Host<Exports>               │  Generic WASM runtime host
└─────────────────────────────┘
```

**Host** — abstract generic class. Serialization: `Object → JSON.stringify → UTF-8 → null-terminate → WASM linear memory`. Deserialization: reverse. Abstract methods: `allocateMemory(capacity)`, `deallocateMemory(pointer)`, `memory()`.

**RawRadixEngineToolkit** — extends `Host<Exports>`. WASM binary loaded inline via `import wasmModule from "../../resources/radix_engine_toolkit.wasm"`. Exposed as singleton `Promise<RawRadixEngineToolkit>`. Memory via `toolkit_alloc` / `toolkit_free_c_string` exports. Errors: checks for `InvocationHandlingError` or `InvocationInterpretationError`.

**RadixEngineToolkit** — all methods `static async`. Delegates to singleton WASM. This is the primary API surface.

---

## Core API — RadixEngineToolkit Static Methods

All methods are `static async` on `RadixEngineToolkit`.

### Build

| Method | Signature |
|--------|-----------|
| `information` | `() → Promise<BuildInformation>` |

### Derive

| Method | Signature |
|--------|-----------|
| `virtualAccountAddressFromPublicKey` | `(publicKey, networkId) → Promise<string>` |
| `virtualIdentityAddressFromPublicKey` | `(publicKey, networkId) → Promise<string>` |
| `virtualSignatureNonFungibleGlobalIdFromPublicKey` | `(publicKey, networkId) → Promise<string>` |
| `virtualAccountAddressFromOlympiaAccountAddress` | `(olympiaAddr, networkId) → Promise<string>` |
| `resourceAddressFromOlympiaResourceAddress` | `(olympiaAddr, networkId) → Promise<string>` |
| `publicKeyFromOlympiaAccountAddress` | `(olympiaAddr) → Promise<Uint8Array>` |
| `olympiaAccountAddressFromPublicKey` | `(publicKey: Uint8Array, network: OlympiaNetwork) → Promise<string>` |
| `nodeAddressFromPublicKey` | `(publicKey: Uint8Array, networkId) → Promise<string>` |
| `bech32mTransactionIdentifierFromIntentHash` | `(hash: Uint8Array, networkId) → Promise<string>` |

### Instructions

| Method | Signature |
|--------|-----------|
| `hash` | `(instructions, networkId) → Promise<Uint8Array>` |
| `convert` | `(instructions, networkId, kind: "String" \| "Parsed") → Promise<Instructions>` |
| `compile` | `(instructions, networkId) → Promise<Uint8Array>` |
| `decompile` | `(compiled: Uint8Array, networkId, kind?) → Promise<Instructions>` |
| `extractAddresses` | `(instructions, networkId) → Promise<Record<EntityType, string[]>>` |
| `staticallyValidate` | `(instructions, networkId) → Promise<StaticValidationResult>` |

### TransactionManifest

| Method | Signature |
|--------|-----------|
| `hash` | `(manifest, networkId) → Promise<Uint8Array>` |
| `compile` | `(manifest, networkId) → Promise<Uint8Array>` |
| `decompile` | `(compiled: Uint8Array, networkId, kind?) → Promise<TransactionManifest>` |
| `staticallyValidate` | `(manifest, networkId) → Promise<StaticValidationResult>` |
| `staticallyAnalyze` | `(manifest, networkId) → Promise<StaticManifestAnalysisResult>` |

### Intent

| Method | Signature |
|--------|-----------|
| `hash` / `intentHash` | `(intent) → Promise<TransactionHash>` |
| `compile` | `(intent) → Promise<Uint8Array>` |
| `decompile` | `(compiled: Uint8Array, kind?) → Promise<Intent>` |
| `staticallyValidate` | `(intent) → Promise<StaticValidationResult>` |

### SignedIntent

| Method | Signature |
|--------|-----------|
| `hash` / `signedIntentHash` | `(signedIntent) → Promise<TransactionHash>` |
| `intentHash` | `(signedIntent) → Promise<TransactionHash>` |
| `compile` | `(signedIntent) → Promise<Uint8Array>` |
| `decompile` | `(compiled: Uint8Array, kind?) → Promise<SignedIntent>` |
| `staticallyValidate` | `(signedIntent) → Promise<StaticValidationResult>` |

### NotarizedTransaction

| Method | Signature |
|--------|-----------|
| `hash` / `notarizedTransactionHash` | `(notarized) → Promise<TransactionHash>` |
| `signedIntentHash` | `(notarized) → Promise<TransactionHash>` |
| `intentHash` | `(notarized) → Promise<TransactionHash>` |
| `compile` | `(notarized) → Promise<Uint8Array>` |
| `decompile` | `(compiled: Uint8Array, kind?) → Promise<NotarizedTransaction>` |
| `staticallyValidate` | `(notarized) → Promise<StaticValidationResult>` |

### V2 Transaction Variants

**TransactionIntentV2:**
`hash`, `compile`, `decompile(compiled, networkId)`, `staticallyAnalyze → StaticTransactionIntentV2AnalysisResult`

**SignedTransactionIntentV2:**
`hash`, `compile`, `decompile(compiled, networkId)`

**NotarizedTransactionV2:**
`hash`, `compile`, `decompile(compiled, networkId)`, `staticallyValidate(notarized, networkId)`

**SubintentV2:**
`hash`, `compile`, `decompile(compiled, networkId)`, `staticallyAnalyze → StaticManifestAnalysisResult`

**PartialTransactionV2:**
`hash`, `compile`, `decompile(compiled, networkId)`

**SignedPartialTransactionV2:**
`hash`, `compile`, `decompile(compiled, networkId)`, `staticallyValidate(signed, networkId)`

### SBOR

**ManifestSbor:**
```ts
decodeToString(payload: Uint8Array, networkId, representation: ManifestSborStringRepresentation, schema?: PayloadSchema): Promise<string>
```

**ScryptoSbor:**
```ts
decodeToString(payload: Uint8Array, networkId, representation: SerializationMode, schema?: PayloadSchema): Promise<string>
encodeProgrammaticJson(object: any): Promise<Uint8Array>
```

### Address

| Method | Signature |
|--------|-----------|
| `entityType` | `(address: string) → Promise<EntityType>` |
| `decode` | `(address: string) → Promise<{ networkId, entityType, hrp, data: Uint8Array }>` |

### Utils

| Method | Signature |
|--------|-----------|
| `knownAddresses` | `(networkId) → Promise<KnownAddresses>` |

---

## ManifestBuilder — Fluent API

`new ManifestBuilder()` — all methods return `this`. Call `.build()` to get `TransactionManifest`.

### Worktop Operations

```ts
takeAllFromWorktop(resourceAddress: string, callback: (builder, bucketId: number) => this): this
takeFromWorktop(resourceAddress: string, amount: Decimal, callback: (builder, bucketId: number) => this): this
takeNonFungiblesFromWorktop(resourceAddress: string, ids: string[], callback: (builder, bucketId: number) => this): this
returnToWorktop(bucketId: number): this
assertWorktopContainsAny(resourceAddress: string): this
assertWorktopContains(resourceAddress: string, amount: Decimal): this
assertWorktopContainsNonFungibles(resourceAddress: string, ids: string[]): this
```

### Auth Zone Operations

```ts
popFromAuthZone(callback: (builder, proofId: number) => this): this
pushToAuthZone(proofId: number): this
dropAuthZoneProofs(): this
createProofFromAuthZoneOfAmount(resourceAddress: string, amount: Decimal, callback: (builder, proofId: number) => this): this
createProofFromAuthZoneOfNonFungibles(resourceAddress: string, ids: string[], callback: (builder, proofId: number) => this): this
createProofFromAuthZoneOfAll(resourceAddress: string, callback: (builder, proofId: number) => this): this
dropAuthZoneSignatureProofs(): this
```

### Bucket / Proof Operations

```ts
createProofFromBucketOfAmount(bucketId: number, amount: Decimal, callback: (builder, proofId: number) => this): this
createProofFromBucketOfNonFungibles(bucketId: number, ids: string[], callback: (builder, proofId: number) => this): this
createProofFromBucketOfAll(bucketId: number, callback: (builder, proofId: number) => this): this
burnResource(bucketId: number): this
cloneProof(proofId: number, callback: (builder, proofId: number) => this): this
dropProof(proofId: number): this
dropAllProofs(): this
```

### Call Operations

```ts
callFunction(packageAddress: string | number, blueprintName: string, functionName: string, args: Value[]): this
callMethod(address: string | number, methodName: string, args: Value[]): this
callRoyaltyMethod(address: string | number, methodName: string, args: Value[]): this
callMetadataMethod(address: string | number, methodName: string, args: Value[]): this
callRoleAssignmentMethod(address: string | number, methodName: string, args: Value[]): this
callDirectVaultMethod(address: string, methodName: string, args: Value[]): this
```

`address: string | number` — string resolves to `ManifestAddress.Static`, number to `ManifestAddress.Named`.

### Other

```ts
allocateGlobalAddress(packageAddress: string, blueprintName: string): this
build(): TransactionManifest
```

### Value Constructor Functions

Exported alongside ManifestBuilder for building `args: Value[]`:

```ts
bool(value: boolean): Value
i8(value: number | string): Value
i16(value: number | string): Value
i32(value: number | string): Value
i64(value: number | bigint | string): Value
i128(value: number | bigint | string): Value
u8(value: number | string): Value
u16(value: number | string): Value
u32(value: number | string): Value
u64(value: number | bigint | string): Value
u128(value: number | bigint | string): Value
str(value: string): Value
enumeration(discriminator: number, ...fields: Value[]): Value
array(elementKind: ValueKind, ...elements: Value[]): Value
tuple(...fields: Value[]): Value
map(keyKind: ValueKind, valueKind: ValueKind, ...entries: [Value, Value][]): Value
address(value: string | number): Value
bucket(value: number): Value
proof(value: number): Value
expression(value: "EntireWorktop" | "EntireAuthZone"): Value
decimal(value: number | bigint | string | Decimal): Value
preciseDecimal(value: number | bigint | string | Decimal): Value
blob(value: Bytes): Value
nonFungibleLocalId(value: string): Value
addressReservation(value: number): Value
```

---

## TransactionBuilder — V1

Step-based builder:

```ts
const builder = await TransactionBuilder.new();
const notarized = await builder
  .header(header: TransactionHeader)      // → TransactionBuilderManifestStep
  .message(message: Message)              // optional, returns self
  .plainTextMessage(message: string)      // optional convenience, returns self
  .manifest(manifest: TransactionManifest) // → TransactionBuilderIntentSignaturesStep
  .sign(source)                           // repeatable, returns self
  .notarize(source);                      // → Promise<NotarizedTransaction>
```

Async variants: `.signAsync(source)`, `.notarizeAsync(source)`.

---

## TransactionV2Builder

```ts
const v2 = await TransactionV2Builder.new();
const notarized = await v2
  .header(header: TransactionHeaderV2)           // → TransactionV2BuilderIntentStep
  .rootIntentCore(core: IntentCoreV2)            // → TransactionV2BuilderSignStep
  .addSignedSubintent(subintent, signatures[])   // repeatable
  .sign(source)                                  // repeatable
  .notarize(source);                             // → Promise<NotarizedTransactionV2>
```

Async variants: `.signAsync(source)`, `.notarizeAsync(source)`.

Preview (no notarization):
```ts
.buildPreviewTransaction({
  rootSignerPublicKeys: PublicKey[],
  nonRootSubintentSignerPublicKeys?: PublicKey[][]
}): PreviewTransactionV2
```

---

## Models — Key Types

### Cryptographic Primitives

```ts
type Curve = "Secp256k1" | "Ed25519";
type Bytes = Uint8Array | string;  // hex string or raw bytes
```

| Constant | Value |
|----------|-------|
| `ED25519_SIGNATURE_LENGTH` | 64 |
| `SECP256K1_SIGNATURE_LENGTH` | 65 |
| `ED25519_PUBLIC_KEY_LENGTH` | 32 |
| `SECP256K1_PUBLIC_KEY_LENGTH` | 33 |
| `ED25519_PRIVATE_KEY_LENGTH` | 32 |
| `SECP256K1_PRIVATE_KEY_LENGTH` | 32 |

**PublicKey** (abstract class):
- Subclasses: `PublicKey.Secp256k1(bytes)`, `PublicKey.Ed25519(bytes)`
- Methods: `rawBytes()`, `hexString()`, `hex()`, `toString()`

**PrivateKey** (abstract class, implements `Signer`):
- Subclasses: `PrivateKey.Secp256k1(bytes)`, `PrivateKey.Ed25519(bytes)`
- Methods: `publicKey()`, `publicKeyBytes()`, `publicKeyHex()`, `sign(hash)`, `signToSignature(hash)`, `signToSignatureWithPublicKey(hash)`, `produceSignature(hash) → SignerResponse`
- Secp256k1 uses `secp256k1` npm (compressed pubkeys); Ed25519 uses `@noble/ed25519` with `@noble/hashes/sha512`

**Signature** (abstract class):
- Subclasses: `Signature.Secp256k1(bytes)`, `Signature.Ed25519(bytes)`
- Methods: `rawBytes()`, `hexString()`, `hex()`

**SignatureWithPublicKey** (abstract class):
- `SignatureWithPublicKey.Secp256k1(signature)` — publicKey is `undefined` (recoverable)
- `SignatureWithPublicKey.Ed25519(signature, publicKey)` — publicKey required

### Transaction Types (V1)

```ts
interface TransactionHeader {
  networkId: number;
  startEpochInclusive: number;
  endEpochExclusive: number;
  nonce: number;
  notaryPublicKey: PublicKey;
  notaryIsSignatory: boolean;
  tipPercentage: number;
}

interface TransactionManifest {
  instructions: Instructions;
  blobs: Uint8Array[];
}

type Instructions =
  | { kind: "String"; value: string }
  | { kind: "Parsed"; value: Instruction[] };

interface Intent {
  header: TransactionHeader;
  manifest: TransactionManifest;
  message: Message;
}

interface SignedIntent {
  intent: Intent;
  intentSignatures: SignatureWithPublicKey[];
}

interface NotarizedTransaction {
  signedIntent: SignedIntent;
  notarySignature: Signature;
}

interface TransactionHash {
  hash: Uint8Array;
  id: string;
}
```

### Message Types

```ts
type Message =
  | { kind: "None" }
  | { kind: "PlainText"; value: PlainTextMessage }
  | { kind: "Encrypted"; value: EncryptedMessage };

interface PlainTextMessage {
  mimeType: string;
  message: MessageContent;
}

type MessageContent =
  | { kind: "String"; value: string }
  | { kind: "Bytes"; value: Uint8Array };
```

### V2 Transaction Types

```ts
interface TransactionHeaderV2 {
  notaryPublicKey: PublicKey;
  notaryIsSignatory: boolean;
  tipBasisPoints: number;       // NOTE: basis points, not percentage
}

interface IntentHeaderV2 {
  networkId: number;
  startEpochInclusive: number;
  endEpochExclusive: number;
  minProposerTimestampInclusive?: number;
  maxProposerTimestampExclusive?: number;
  intentDiscriminator: number;
}

interface IntentCoreV2 {
  header: IntentHeaderV2;
  instructions: string;         // string format only (not Parsed)
  blobs: Uint8Array[];
  message: MessageV2;
  children: Uint8Array[];       // subintent hashes
}

interface SubintentV2 { intentCore: IntentCoreV2 }

interface TransactionIntentV2 {
  transactionHeader: TransactionHeaderV2;
  rootIntentCore: IntentCoreV2;
  nonRootSubintents: SubintentV2[];
}

interface SignedTransactionIntentV2 {
  transactionIntent: TransactionIntentV2;
  transactionIntentSignatures: SignatureWithPublicKey[];
  nonRootSubintentSignatures: SignatureWithPublicKey[][];
}

interface NotarizedTransactionV2 {
  signedTransactionIntent: SignedTransactionIntentV2;
  notarySignature: Signature;
}

interface PartialTransactionV2 {
  rootSubintent: SubintentV2;
  nonRootSubintents: SubintentV2[];
}

interface SignedPartialTransactionV2 {
  partialTransaction: PartialTransactionV2;
  rootSubintentSignatures: SignatureWithPublicKey[];
  nonRootSubintentSignatures: SignatureWithPublicKey[][];
}

interface PreviewTransactionV2 {
  transactionIntent: TransactionIntentV2;
  rootSignerPublicKeys: PublicKey[];
  nonRootSubintentSignerPublicKeys: PublicKey[][];
}
```

### Address Types

```ts
type ManifestAddress =
  | { kind: "Static"; value: string }
  | { kind: "Named"; value: number };

enum EntityType {
  GlobalPackage, GlobalConsensusManager, GlobalValidator,
  GlobalTransactionTracker, GlobalGenericComponent, GlobalAccount,
  GlobalIdentity, GlobalAccessController,
  GlobalOneResourcePool, GlobalTwoResourcePool, GlobalMultiResourcePool,
  GlobalAccountLocker,
  GlobalPreallocatedSecp256k1Account, GlobalPreallocatedSecp256k1Identity,
  GlobalPreallocatedEd25519Account, GlobalPreallocatedEd25519Identity,
  GlobalFungibleResourceManager, InternalFungibleVault,
  GlobalNonFungibleResourceManager, InternalNonFungibleVault,
  InternalGenericComponent, InternalKeyValueStore
}
```

### Value — Discriminated Union

```ts
enum ValueKind {
  Bool, I8, I16, I32, I64, I128,
  U8, U16, U32, U64, U128,
  String, Enum, Array, Tuple, Map,
  Address, Bucket, Proof, Expression,
  Blob, Decimal, PreciseDecimal,
  NonFungibleLocalId, AddressReservation
}

type Value =
  | { kind: ValueKind.Bool; value: boolean }
  | { kind: ValueKind.I8; value: number }
  | { kind: ValueKind.I16; value: number }
  | { kind: ValueKind.I32; value: number }
  | { kind: ValueKind.I64; value: bigint }
  | { kind: ValueKind.I128; value: bigint }
  | { kind: ValueKind.U8; value: number }
  | { kind: ValueKind.U16; value: number }
  | { kind: ValueKind.U32; value: number }
  | { kind: ValueKind.U64; value: bigint }
  | { kind: ValueKind.U128; value: bigint }
  | { kind: ValueKind.String; value: string }
  | { kind: ValueKind.Enum; discriminator: number; fields: Value[] }
  | { kind: ValueKind.Array; elementValueKind: ValueKind; elements: Value[] }
  | { kind: ValueKind.Tuple; fields: Value[] }
  | { kind: ValueKind.Map; keyValueKind: ValueKind; valueValueKind: ValueKind; entries: MapEntry[] }
  | { kind: ValueKind.Address; value: ManifestAddress }
  | { kind: ValueKind.Bucket; value: number }
  | { kind: ValueKind.Proof; value: number }
  | { kind: ValueKind.Expression; value: Expression }
  | { kind: ValueKind.Blob; value: Uint8Array }
  | { kind: ValueKind.Decimal; value: Decimal }
  | { kind: ValueKind.PreciseDecimal; value: Decimal }
  | { kind: ValueKind.NonFungibleLocalId; value: string }
  | { kind: ValueKind.AddressReservation; value: number };

interface MapEntry { key: Value; value: Value }
enum Expression { EntireWorktop = "EntireWorktop", EntireAuthZone = "EntireAuthZone" }
```

### Static Analysis Types

```ts
type StaticValidationResult =
  | { kind: "Valid" }
  | { kind: "Invalid"; error: string };

interface StaticManifestAnalysisResult {
  encountered_entities: string[];
  accounts_requiring_auth: string[];
  accounts_withdrawn_from: string[];
  accounts_deposited_into: string[];
  classification: string[];
  reserved_instructions: string[];
}

interface StaticTransactionIntentV2AnalysisResult {
  root_intent: StaticManifestAnalysisResult;
  non_root_subintents: StaticManifestAnalysisResult[];
}
```

### Known Addresses

```ts
interface KnownAddresses {
  resourceAddresses: {
    xrd, secp256k1SignatureResource, ed25519SignatureResource,
    packageOfDirectCallerResource, globalCallerResource,
    systemExecutionResource, packageOwnerBadge, validatorOwnerBadge,
    accountOwnerBadge, identityOwnerBadge: string
  };
  packageAddresses: {
    packagePackage, resourcePackage, accountPackage, identityPackage,
    consensusManagerPackage, accessControllerPackage, poolPackage,
    transactionProcessorPackage, metadataModulePackage,
    royaltyModulePackage, roleAssignmentModulePackage,
    genesisHelperPackage, faucetPackage: string
  };
  componentAddresses: {
    consensusManager, genesisHelper, faucet: string
  };
}
```

### SBOR Modes

```ts
enum SerializationMode { Programmatic, Model, Natural }
enum ManifestSborStringRepresentation { ManifestString, ProgrammaticJson, ModelJson, NaturalJson }
```

---

## Signing Patterns — 4 Methods

```ts
type SignatureSource<T> = Signer | T | SignatureFunction<T>;
type SignatureFunction<T> = (messageHash: Uint8Array) => T;

interface Signer {
  produceSignature: (messageHash: Uint8Array) => SignerResponse;
}

interface SignerResponse {
  curve: Curve;
  signature: Uint8Array;
  publicKey: Uint8Array;
}
```

| # | Method | How | Example |
|---|--------|-----|---------|
| 1 | Direct Signer | Pass `PrivateKey` instance (implements `Signer`) | `.sign(privateKey)` |
| 2 | Pre-computed signature | Pass `Signature` / `SignatureWithPublicKey` directly | `.sign(Signature.Ed25519(bytes))` |
| 3 | Sync function | `(hash: Uint8Array) => T` | `.sign((hash) => key.signToSignatureWithPublicKey(hash))` |
| 4 | Async function | Via `.signAsync` / `.notarizeAsync` | `.signAsync(async (hash) => await remoteSign(hash))` |

---

## LTS API — LTSRadixEngineToolkit

Simplified API for common transaction workflows.

### LTSRadixEngineToolkit.Transaction

| Method | Signature |
|--------|-----------|
| `compile` | `(intent: CompilableIntent) → Promise<Uint8Array>` |
| `compileTransactionIntent` | `(intent: LTSTransactionIntent) → Promise<Uint8Array>` |
| `compileSignedTransactionIntent` | `(signed: LTSSignedTransactionIntent) → Promise<Uint8Array>` |
| `compileNotarizedTransactionIntent` | `(notarized: LTSNotarizedTransaction) → Promise<Uint8Array>` |
| `summarizeTransaction` | `(tx: HasCompiledIntent \| Uint8Array) → Promise<TransactionSummary>` |

### LTSRadixEngineToolkit.Derive

| Method | Signature |
|--------|-----------|
| `virtualAccountAddress` | `(publicKey, networkId) → Promise<string>` |
| `babylonAccountAddressFromOlympiaAccountAddress` | `(olympiaAddr, networkId) → Promise<OlympiaToBabylonAddressMapping>` |
| `babylonResourceAddressFromOlympiaResourceAddress` | `(olympiaAddr, networkId) → Promise<string>` |
| `knownAddresses` | `(networkId) → Promise<AddressBook>` |
| `bech32mTransactionIdentifierFromIntentHash` | `(hash: Uint8Array, networkId) → Promise<string>` |

### LTSRadixEngineToolkit.Address

| Method | Signature |
|--------|-----------|
| `isGlobalAccount` | `(address: string) → Promise<boolean>` |
| `isFungibleResource` | `(address: string) → Promise<boolean>` |
| `isNonFungibleResource` | `(address: string) → Promise<boolean>` |

### LTSRadixEngineToolkit.Utils / TestUtils

| Method | Signature |
|--------|-----------|
| `hash` | `(data: Uint8Array) → Uint8Array` (synchronous) |
| `createAccountWithDisabledDeposits` | `(currentEpoch, networkId) → Promise<{ accountAddress, compiledNotarizedTransaction }>` |

### LTS Transaction Summary

```ts
interface TransactionSummary {
  feesLocked: { account: string; amount: Decimal };
  withdraws: Record<string, Record<string, Decimal>>;  // account → resource → amount
  deposits: Record<string, Record<string, Decimal>>;   // account → resource → amount
}
```

### SimpleTransactionBuilder

High-level builder for common transfer patterns:

```ts
const builder = await SimpleTransactionBuilder.new({
  networkId: NetworkId.Mainnet,
  validFromEpoch: currentEpoch,
  fromAccount: accountAddress,
  signerPublicKey: publicKey,
});

const compiled = builder
  .lockedFee("10")
  .transferFungible({ toAccount: recipient, resourceAddress: xrd, amount: "100" })
  .compileIntent()
  .compileNotarized(notaryKey);
```

Methods: `nonce(n)`, `feePayer(addr)`, `permanentlyRejectAfterEpochs(1–100)`, `tipPercentage(n)`, `lockedFee(amount)`, `transferFungible({ toAccount, resourceAddress, amount })`, `compileIntent()`, `compileIntentWithSignatures(sources[])`.

Static: `SimpleTransactionBuilder.freeXrdFromFaucet(settings) → Promise<CompiledNotarizedTransaction>`

### LTS Wrapper Classes

```ts
interface CompilableIntent { compile(): Promise<Uint8Array> }
interface HasCompiledIntent { compiledIntent(): Promise<Uint8Array> }

class CompiledSignedTransactionIntent implements HasCompiledIntent {
  intentHash: TransactionHash
  compiledSignedIntent: Uint8Array
  signedIntentHash: TransactionHash
  get hashToNotarize(): Uint8Array
  get transactionId(): TransactionHash
  compileNotarized(source: SignatureSource<Signature>): CompiledNotarizedTransaction
  compileNotarizedAsync(source): Promise<CompiledNotarizedTransaction>
}

class CompiledNotarizedTransaction implements HasCompiledIntent {
  compiled: Uint8Array
  intentHash: TransactionHash
  notarizedPayloadHash: TransactionHash
  toByteArray(): Uint8Array
  toHex(): string
  intentHashHex(): string
  transactionIdHex(): string
  staticallyValidate(networkId): Promise<TransactionValidity>
  summarizeTransaction(): Promise<TransactionSummary>
}
```

---

## Utilities

### Convert

```ts
Convert.String.toNumber(str): number
Convert.String.toBigInt(str): bigint
Convert.String.toDecimal(str): Decimal
Convert.Number.toString(num): string
Convert.Uint8Array.toHexString(array): string
Convert.HexString.toUint8Array(str): Uint8Array
Convert.BigInt.toString(num): string
Convert.Decimal.toString(num): string
```

### Hash & Nonce

```ts
hash(data: Uint8Array): Uint8Array          // Blake2b-256
generateRandomNonce(): number                // Math.random() * 0xffffffff
```

---

## NetworkId Constants

```ts
namespace NetworkId {
  Mainnet    = 0x01  // 1
  Stokenet   = 0x02  // 2
  Alphanet   = 0x0a  // 10
  Betanet    = 0x0b  // 11
  Kisharnet  = 0x0c  // 12
  Ansharnet  = 0x0d  // 13
  Zabanet    = 0x0e  // 14
  RCNetV1    = Kisharnet
  RCNetV2    = Ansharnet
  RCNetV3    = Zabanet
  Gilganet   = 0x20  // 32
  Enkinet    = 0x21  // 33
  Hammunet   = 0x22  // 34
  Nergalnet  = 0x23  // 35
  Mardunet   = 0x24  // 36
  LocalNet   = 0xf0  // 240
  InternalTestNet = 0xf1  // 241
  Simulator  = 0xf2  // 242
}
```

---

## Common Workflows

### Build → Sign → Notarize → Compile → Submit (V1)

```ts
import {
  ManifestBuilder, TransactionBuilder, RadixEngineToolkit,
  NetworkId, generateRandomNonce, PrivateKey,
  decimal, address, bucket, enumeration,
} from "@steleaio/radix-engine-toolkit";

// 1. Build manifest
const manifest = new ManifestBuilder()
  .callMethod(account, "lock_fee", [decimal("10")])
  .callMethod(account, "withdraw", [address(xrd), decimal("100")])
  .takeFromWorktop(xrd, new Decimal("100"), (builder, bucketId) =>
    builder.callMethod(recipient, "try_deposit_or_abort", [
      bucket(bucketId),
      enumeration(0),
    ])
  )
  .build();

// 2. Build, sign, notarize
const notarized = await (await TransactionBuilder.new())
  .header({
    networkId: NetworkId.Mainnet,
    startEpochInclusive: currentEpoch,
    endEpochExclusive: currentEpoch + 10,
    nonce: generateRandomNonce(),
    notaryPublicKey: notaryKey.publicKey(),
    notaryIsSignatory: true,
    tipPercentage: 0,
  })
  .manifest(manifest)
  .sign(signerPrivateKey)
  .notarize(notaryKey);

// 3. Compile to bytes
const compiled = await RadixEngineToolkit.NotarizedTransaction.compile(notarized);

// 4. Submit compiled bytes to Gateway API
```

### V2 Transaction with Subintents

```ts
const notarizedV2 = await (await TransactionV2Builder.new())
  .header({
    notaryPublicKey: notaryKey.publicKey(),
    notaryIsSignatory: true,
    tipBasisPoints: 0,
  })
  .rootIntentCore({
    header: {
      networkId: NetworkId.Mainnet,
      startEpochInclusive: epoch,
      endEpochExclusive: epoch + 10,
      intentDiscriminator: generateRandomNonce(),
    },
    instructions: manifestString,
    blobs: [],
    message: { kind: "None" },
    children: [subintentHash],
  })
  .addSignedSubintent(subintent, subintentSignatures)
  .sign(signerKey)
  .notarize(notaryKey);
```

### Async Signing (e.g., Hardware Wallet)

```ts
const notarized = await builder
  .header(header)
  .manifest(manifest)
  .signAsync(async (hash) => {
    const sig = await hardwareWallet.sign(hash);
    return SignatureWithPublicKey.Ed25519(sig, publicKey);
  })
  .notarizeAsync(async (hash) => {
    const sig = await hardwareWallet.sign(hash);
    return Signature.Ed25519(sig);
  });
```
