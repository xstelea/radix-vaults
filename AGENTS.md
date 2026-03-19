# Context Spec Index

Reference specs for AI agents working in this codebase. All files live in `context/`.

---

## Topic Cross-Reference Index

Common agent tasks mapped to which specs to read (in priority order).

### Building / submitting transactions
→ [radix-TransactionManifest.md](context/radix-TransactionManifest.md) — manifest DSL, 36 instructions, builder API
→ [radix-TxTool.md](context/radix-TxTool.md) — Effect service: build→sign→submit→poll lifecycle
→ [radix-TypescriptRadixEngineToolkit.md](context/radix-TypescriptRadixEngineToolkit.md) — WASM compile/decompile, `ManifestBuilder` fluent API
→ [radix-transactions.md](context/radix-transactions.md) — Rust-level tx model, V1/V2 structures, validation

### Access control & permissions
→ [radix-AccessRule.md](context/radix-AccessRule.md) — `AccessRule` hierarchy, roles, `rule!()` macro
→ [radix-Account.md](context/radix-Account.md) — owner badge, deposit rules, `securify()`
→ [radix-TransactionManifest.md](context/radix-TransactionManifest.md) — `SET_OWNER_ROLE`, proof instructions

### Wallet integration & authentication
→ [radix-radix-dapp-toolkit.md](context/radix-radix-dapp-toolkit.md) — `RadixDappToolkit`, wallet API, `<radix-connect-button>`
→ [radix-ROLA.md](context/radix-ROLA.md) — challenge-response verification, `owner_keys` metadata
→ [tanstackStart-ConsultationDapp.md](context/tanstackStart-ConsultationDapp.md) — practical wallet + Effect Atoms integration

### Serialization (SBOR encoding/decoding)
→ [radix-Sbor.md](context/radix-Sbor.md) — wire format, `ValueKind`, custom value kinds, depth limits
→ [radix-TypescriptRadixEngineToolkit.md](context/radix-TypescriptRadixEngineToolkit.md) — `ScryptoSbor`/`ManifestSbor` decode in TS
→ [radix-Gateway.md](context/radix-Gateway.md) — SBOR schema system for component state queries

### Effect.js service architecture (DI, layers, config)
→ [effect-Context.md](context/effect-Context.md) — `Context.Tag`, `Effect.Service`, service definition
→ [effect-Layer.md](context/effect-Layer.md) — `Layer.provide`, `Layer.merge`, DAG composition
→ [effect-Pipe.md](context/effect-Pipe.md) — `pipe()` / `.pipe()` for chaining operators
→ [effect-Schema.md](context/effect-Schema.md) — `Schema<A, I, R>`, runtime validation, branded types

### HTTP / API communication
→ [effect-Platform.md](context/effect-Platform.md) — `HttpClient`, `HttpServer`, `HttpRouter`, middleware
→ [effect-Rpc.md](context/effect-Rpc.md) — typed RPC procedures, streaming, transport layers
→ [radix-Gateway.md](context/radix-Gateway.md) — Gateway API wrapper, rate limiting, pagination

### Frontend state & routing
→ [effect-atom.md](context/effect-atom.md) — `Atom.make`, `useAtomValue`, Result pattern, Suspense
→ [tanstack-Router.md](context/tanstack-Router.md) — file-based routing, SSR, code splitting, data loading
→ [tanstackStart-ConsultationDapp.md](context/tanstackStart-ConsultationDapp.md) — Atom.family, streaming atoms, responsive layout

### Multisig & subintents
→ [radix-SubIntents.md](context/radix-SubIntents.md) — `YIELD_TO_PARENT`/`YIELD_TO_CHILD`, partial transactions
→ [radix-radix-dapp-toolkit.md](context/radix-radix-dapp-toolkit.md) — `sendPreAuthorizationRequest()`
→ [radix-transactions.md](context/radix-transactions.md) — `PartialTransactionV2Builder`, subintent tree validation
→ [radix-AccessRule.md](context/radix-AccessRule.md) — n-of-m rules, virtual signature badges

### Concurrency & async patterns
→ [effect-Queue.md](context/effect-Queue.md) — bounded/unbounded queues, backpressure strategies
→ [effect-Rpc.md](context/effect-Rpc.md) — streaming RPCs, Ack backpressure, mailbox channels
→ [effect-atom.md](context/effect-atom.md) — mailbox channels for reactive updates

---

## Effect.js

| File | Description | Keywords |
| ---- | ----------- | -------- |
| [effect-Context.md](context/effect-Context.md) | DI and type-safe service composition via Context tags | `Context.Tag`, `Effect.Service`, `Effect.provideService`, `Layer.succeed`, `Ref`, dependency injection, service composition, type-level `R` tracking, scoped cleanup |
| [effect-Layer.md](context/effect-Layer.md) | Composable, memoized service dependency graph blueprints | `Layer.provide`, `Layer.merge`, `Layer.mergeAll`, `Layer.fresh`, `Layer.scoped`, `MemoMap`, DAG composition, diamond dependencies, resource cleanup, retry |
| [effect-Pipe.md](context/effect-Pipe.md) | `pipe()` function and `.pipe()` method for composition | `pipe()`, `flow()`, `Effect.map`, `Effect.flatMap`, `Effect.catchTag`, Pipeable interface, left-to-right composition, method chaining |
| [effect-Platform.md](context/effect-Platform.md) | Platform-independent HTTP, filesystem, terminal, workers | `HttpClient`, `HttpServer`, `HttpRouter`, `HttpApi`, `FileSystem`, `Terminal`, `CommandExecutor`, `Worker`, `Socket`, middleware, branded types, stream I/O |
| [effect-Queue.md](context/effect-Queue.md) | Fiber-safe async bounded queue with backpressure | `Queue.bounded`, `Queue.unbounded`, `Queue.dropping`, `Queue.sliding`, `Queue.offer`, `Queue.take`, producer-consumer, overflow strategies, shutdown semantics |
| [effect-Rpc.md](context/effect-Rpc.md) | Type-safe transport-agnostic RPC with streaming | `Rpc.make`, `RpcGroup`, `RpcServer`, `RpcClient`, `RpcMiddleware.Tag`, `RpcSerialization`, WebSocket, HTTP, streaming, Ack backpressure, distributed tracing |
| [effect-Schema.md](context/effect-Schema.md) | Runtime validation/transformation with TS type inference | `Schema<A,I,R>`, `S.Struct`, `S.Class`, `S.TaggedError`, `S.brand`, `S.transform`, `S.filter`, `S.decodeSync`, `S.encode`, refinements, recursive schemas, AST |
| [effect-atom.md](context/effect-atom.md) | Reactive state management for Effect + React | `Atom.make`, `Atom.family`, `runtime.atom`, `runtime.fn`, `Result` (Initial/Success/Failure), `useAtomValue`, `useAtomSuspense`, `withToast`, idle TTL, finalizers |

> **See also**: Context ↔ Layer (tags are provided via layers), Layer ↔ Pipe (composition chained via `.pipe()`), Platform ↔ Rpc (transport layers use platform services), Schema ↔ Rpc (payloads validated via Schema), atom ↔ Context+Layer (atoms access services via DI)

---

## Radix DLT

| File | Description | Keywords |
| ---- | ----------- | -------- |
| [radix-AccessRule.md](context/radix-AccessRule.md) | Access control type hierarchy, roles, SBOR encoding | `AccessRule`, `CompositeRequirement`, `BasicRequirement`, `OwnerRole`, `rule!()`, `enable_method_auth!()`, `roles!()`, virtual badges, proof validation, n-of-m |
| [radix-Account.md](context/radix-Account.md) | Native Account blueprint: 30 methods, deposit rules, badges | `Account`, `create_advanced()`, `securify()`, `deposit()`, `withdraw()`, `DefaultDepositRule`, `AccountOwnerBadgeData`, fee locking, `ResourcePreference` |
| [radix-Gateway.md](context/radix-Gateway.md) | Effect wrapper for Gateway API with rate limiting | `GatewayApiClient`, `GetFungibleBalance`, `GetComponentStateService`, `GetKeyValueStore`, `PreviewTransaction`, entity details, pagination, 429 retry, SBOR schema |
| [radix-ROLA.md](context/radix-ROLA.md) | Off-ledger challenge-response wallet authentication | `Rola()`, `verifySignedChallenge()`, `SignedChallenge`, `createSignatureMessage()`, blake2b hash, `owner_keys` metadata, virtual address derivation, persona proof |
| [radix-Sbor.md](context/radix-Sbor.md) | Self-describing binary serialization format | `ValueKind`, `Encode`/`Decode`/`Categorize` traits, `ScryptoSbor`, `ManifestSbor`, `Traverser`, custom value kinds (`Reference` 0x80, `Decimal` 0xa0), LEB128, depth limit 64 |
| [radix-SubIntents.md](context/radix-SubIntents.md) | Composable atomic transactions, multisig, pre-auth | `PartialTransactionBuilder`, `SubintentManifestV2`, `YIELD_TO_PARENT`, `YIELD_TO_CHILD`, `VERIFY_PARENT`, delegated fees, max depth 3, max 32 subintents |
| [radix-TransactionManifest.md](context/radix-TransactionManifest.md) | Manifest instruction sets, builders, compiler pipeline | `TransactionManifestV1`/`V2`, `ManifestBuilder<M>`, `compile_manifest()`, 28+8 instructions, `StaticManifestInterpreter`, worktop/bucket/proof lifecycle, resource constraints |
| [radix-TxTool.md](context/radix-TxTool.md) | Effect service for V1 tx lifecycle (build→submit→poll) | `TransactionHelper`, `CreateTransactionIntent`, `CompileTransaction`, `SubmitTransaction`, `VaultLive`/`makePrivateKeySigner`, `faucet()`, `createBadge()`, lifecycle hooks, exponential backoff |
| [radix-TypescriptRadixEngineToolkit.md](context/radix-TypescriptRadixEngineToolkit.md) | TS/WASM wrapper with builder patterns for tx building | `RadixEngineToolkit`, `ManifestBuilder`, `TransactionBuilder`, `TransactionV2Builder`, `PartialTransactionV2Builder`, address derivation, value constructors, SBOR decode, compile/decompile |
| [radix-radix-dapp-toolkit.md](context/radix-radix-dapp-toolkit.md) | Official SDK for wallet integration and tx signing | `RadixDappToolkit()`, `WalletApi`, `sendTransaction()`, `sendPreAuthorizationRequest()`, `DataRequestBuilder`, `SignedChallenge`, `<radix-connect-button>`, ConnectorExtension |
| [radix-transactions.md](context/radix-transactions.md) | Canonical Rust lib for building/signing/validating txs | `NotarizedTransactionV1`/`V2`, `TransactionIntentV1`, `ManifestBuilder<M>`, `TransactionValidator`, `PrivateKey` (Secp256k1/Ed25519), `Signer` trait, hash computation, validation limits |

> **See also**: TransactionManifest ↔ TxTool ↔ TypescriptRadixEngineToolkit ↔ transactions (four layers of the tx pipeline: DSL → Effect service → WASM toolkit → Rust lib). AccessRule ↔ Account (authorization for account methods). ROLA ↔ radix-dapp-toolkit (wallet proofs → server verification). Sbor ↔ Gateway (SBOR schema for state queries). SubIntents ↔ radix-dapp-toolkit (pre-auth requests).

---

## TanStack / App

| File | Description | Keywords |
| ---- | ----------- | -------- |
| [tanstack-Router.md](context/tanstack-Router.md) | Type-safe client-side router with SSR and file-based routing | `createRouter()`, `createRoute()`, `Link`, `useBlocker()`, `routeTree.gen.ts`, search validation (Zod/Valibot), `loader`/`beforeLoad`/`loaderDeps`, code splitting, SSR hydration, scroll restoration, `head()` meta |
| [tanstackStart-ConsultationDapp.md](context/tanstackStart-ConsultationDapp.md) | Governance dApp architecture: React 19, TanStack Start, Effect | `Atom.context()`, `Atom.family()`, `runtime.fn`, `withToast()`, `ClientOnly`, `RadixDappToolkit` as Effect Tag, `SendTransaction` service, `GovernanceConfig` layer, `useSyncExternalStore`, pathless layouts, responsive grid |

> **See also**: tanstack-Router ↔ ConsultationDapp (Router framework → practical dApp usage). ConsultationDapp ↔ effect-atom (Atom patterns for state). ConsultationDapp ↔ radix-dapp-toolkit (wallet connection in practice).
