# Context Spec Index

Reference specs for AI agents working in this codebase. All files live in `context/`.

## Effect.js

| File | Description |
|------|-------------|
| [effect-Context.md](context/effect-Context.md) | DI and type-safe service composition via Context tags |
| [effect-Layer.md](context/effect-Layer.md) | Composable, memoized service dependency graph blueprints |
| [effect-Pipe.md](context/effect-Pipe.md) | `pipe()` function and `.pipe()` method for composition |
| [effect-Platform.md](context/effect-Platform.md) | Platform-independent HTTP, filesystem, terminal, workers |
| [effect-Queue.md](context/effect-Queue.md) | Fiber-safe async bounded queue with backpressure |
| [effect-Rpc.md](context/effect-Rpc.md) | Type-safe transport-agnostic RPC with streaming |
| [effect-Schema.md](context/effect-Schema.md) | Runtime validation/transformation with TS type inference |
| [effect-atom.md](context/effect-atom.md) | Reactive state management for Effect + React |

## Radix DLT

| File | Description |
|------|-------------|
| [radix-AccessRule.md](context/radix-AccessRule.md) | Access control type hierarchy, roles, SBOR encoding |
| [radix-Account.md](context/radix-Account.md) | Native Account blueprint: 30 methods, deposit rules, badges |
| [radix-Gateway.md](context/radix-Gateway.md) | Effect wrapper for Gateway API with rate limiting |
| [radix-ROLA.md](context/radix-ROLA.md) | Off-ledger challenge-response wallet authentication |
| [radix-Sbor.md](context/radix-Sbor.md) | Self-describing binary serialization format |
| [radix-SubIntents.md](context/radix-SubIntents.md) | Composable atomic transactions, multisig, pre-auth |
| [radix-TransactionManifest.md](context/radix-TransactionManifest.md) | Manifest instruction sets, builders, compiler pipeline |
| [radix-TxTool.md](context/radix-TxTool.md) | Effect service for V1 tx lifecycle (build→submit→poll) |
| [radix-TypescriptRadixEngineToolkit.md](context/radix-TypescriptRadixEngineToolkit.md) | TS/WASM wrapper with builder patterns for tx building |
| [radix-radix-dapp-toolkit.md](context/radix-radix-dapp-toolkit.md) | Official SDK for wallet integration and tx signing |
| [radix-transactions.md](context/radix-transactions.md) | Canonical Rust lib for building/signing/validating txs |

## TanStack / App

| File | Description |
|------|-------------|
| [tanstack-Router.md](context/tanstack-Router.md) | Type-safe client-side router with SSR and file-based routing |
| [tanstackStart-ConsultationDapp.md](context/tanstackStart-ConsultationDapp.md) | Governance dApp architecture: React 19, TanStack Start, Effect |
