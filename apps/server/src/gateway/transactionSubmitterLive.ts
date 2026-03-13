import { GatewayApiClient, PreviewTransactionV2 } from '@radix-effects/gateway'
import {
  Epoch,
  HexString,
  NetworkId,
  TransactionManifestString
} from '@radix-effects/shared'
import {
  CompileTransaction,
  CreateTransactionIntent,
  IntentHashService,
  schemas,
  Signer,
  SubmitTransaction,
  TransactionHeaderV2,
  TransactionStatus
} from '@radix-effects/tx-tool'
import {
  Convert,
  PrivateKey,
  RadixEngineToolkit,
  type PreviewTransactionV2 as RETPreviewTransactionV2,
  type SubintentV2 as RETSubintentV2
} from '@steleaio/radix-engine-toolkit'
import { Config, ConfigProvider, Effect, Layer, Option, Redacted } from 'effect'
import {
  TransactionSubmitError,
  TransactionSubmitter,
  type AccountInteraction,
  type PreviewSubintentResult
} from './transactionSubmitter'

export const TransactionSubmitterLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const feePayerKeyHex = yield* Config.string(
      'FEE_PAYER_PRIVATE_KEY_HEX'
    ).pipe(Config.redacted)
    const networkId = yield* Config.number('NETWORK_ID')

    const hex = Redacted.value(feePayerKeyHex) as string
    const feePayerAddress = yield* Effect.tryPromise({
      try: () =>
        RadixEngineToolkit.Derive.virtualAccountAddressFromPublicKey(
          new PrivateKey.Ed25519(hex).publicKey(),
          networkId
        ),
      catch: (e) =>
        new TransactionSubmitError({
          message: `Failed to derive fee payer address: ${e}`
        })
    })

    const SignerLayer = Signer.makePrivateKeySigner(
      Redacted.make(HexString.make(hex))
    )

    const GatewayLayer = GatewayApiClient.Default.pipe(
      Layer.provide(
        Layer.setConfigProvider(
          ConfigProvider.fromJson({ NETWORK_ID: networkId }).pipe(
            ConfigProvider.orElse(() => ConfigProvider.fromEnv())
          )
        )
      )
    )

    const TxLayer = Layer.mergeAll(
      CreateTransactionIntent.Default,
      CompileTransaction.Default,
      SubmitTransaction.Default,
      TransactionStatus.Default,
      IntentHashService.Default,
      TransactionHeaderV2.Default
    ).pipe(Layer.provide(SignerLayer), Layer.provide(GatewayLayer))

    const PreviewV2Layer = PreviewTransactionV2.Default.pipe(
      Layer.provide(GatewayLayer)
    )

    const AppLayer = Layer.mergeAll(
      TxLayer,
      GatewayLayer,
      SignerLayer,
      PreviewV2Layer
    )

    return Layer.succeed(
      TransactionSubmitter,
      TransactionSubmitter.make({
        feePayerAddress,

        submitFeePayerOnly: (manifest) =>
          Effect.gen(function* () {
            const createIntent = yield* CreateTransactionIntent
            const intentHash = yield* IntentHashService
            const signer = yield* Signer
            const compile = yield* CompileTransaction
            const submit = yield* SubmitTransaction
            const txStatus = yield* TransactionStatus
            const gateway = yield* GatewayApiClient

            const intent = yield* createIntent({
              manifest: TransactionManifestString.make(manifest)
            })
            const intentWithNotary = {
              ...intent,
              header: { ...intent.header, notaryIsSignatory: true }
            }
            const { id, hash } = yield* intentHash.create(intentWithNotary)
            const signatures = yield* signer.signToSignatureWithPublicKey(hash)
            const compiled = yield* compile({
              intent: intentWithNotary,
              signatures
            })
            yield* submit({ compiledTransaction: compiled })
            yield* txStatus.poll({ id })

            const details = yield* gateway.transaction.getCommittedDetails(id, {
              rawHex: false,
              receiptEvents: false,
              receiptFeeSource: false,
              receiptFeeSummary: false,
              receiptFeeDestination: false,
              receiptCostingParameters: false,
              receiptStateChanges: true,
              affectedGlobalEntities: true,
              balanceChanges: false,
              receiptOutput: false,
              manifestInstructions: false
            })

            const entities = details.transaction.affected_global_entities ?? []

            return { intentHash: id, entities }
          }).pipe(
            Effect.provide(AppLayer),
            Effect.mapError(
              (e) =>
                new TransactionSubmitError({
                  message: `Transaction failed: ${String(e)}`
                })
            )
          ),

        submitWithSubintent: ({ partialTransactionHex, signatures }) =>
          Effect.gen(function* () {
            const headerV2Service = yield* TransactionHeaderV2
            const intentHashSvc = yield* IntentHashService
            const compile = yield* CompileTransaction
            const submit = yield* SubmitTransaction

            // 1. Decompile stored partial transaction
            const partialBytes = Convert.HexString.toUint8Array(
              partialTransactionHex
            )
            const partialTx = yield* Effect.tryPromise(() =>
              RadixEngineToolkit.PartialTransactionV2.decompile(
                partialBytes,
                networkId
              )
            )

            // 2. Hash child subintent
            const childSubintentHash = yield* Effect.tryPromise(() =>
              RadixEngineToolkit.SubintentV2.hash(partialTx.rootSubintent)
            )

            // 3. Get V2 headers (auto-fills epoch, uses fee payer as notary)
            const { transactionHeader, intentHeader } = yield* headerV2Service({
              networkId: NetworkId.make(networkId),
              startEpochInclusive: Option.none(),
              endEpochExclusive: Option.none(),
              notaryIsSignatory: true
            })

            // 4. Root manifest: USE_CHILD + lock_fee + YIELD_TO_CHILD
            const rootManifest = TransactionManifestString.make(
              `USE_CHILD
  NamedIntent("withdrawal")
  Intent("${childSubintentHash.id}")
;
CALL_METHOD
  Address("${feePayerAddress}")
  "lock_fee"
  Decimal("10")
;
YIELD_TO_CHILD
  NamedIntent("withdrawal")
;
`
            )

            // 5. Adapt decompiled subintent to tx-tool branded types
            const childCore = partialTx.rootSubintent.intentCore
            const childSubintent = {
              intentCore: {
                header: {
                  networkId: NetworkId.make(childCore.header.networkId),
                  startEpochInclusive: Epoch.make(
                    childCore.header.startEpochInclusive
                  ),
                  endEpochExclusive: Epoch.make(
                    childCore.header.endEpochExclusive
                  ),
                  intentDiscriminator: childCore.header.intentDiscriminator,
                  ...(childCore.header.minProposerTimestampInclusive !==
                    undefined && {
                    minProposerTimestampInclusive:
                      childCore.header.minProposerTimestampInclusive
                  }),
                  ...(childCore.header.maxProposerTimestampExclusive !==
                    undefined && {
                    maxProposerTimestampExclusive:
                      childCore.header.maxProposerTimestampExclusive
                  })
                },
                instructions: TransactionManifestString.make(
                  childCore.instructions as string
                ),
                blobs: [...childCore.blobs],
                message: childCore.message as schemas.TransactionMessageV2,
                children: [...childCore.children]
              }
            } satisfies schemas.SubintentV2

            // 6. Build TransactionIntentV2
            const intent: schemas.TransactionIntentV2 = {
              transactionHeader,
              rootIntentCore: {
                header: intentHeader,
                instructions: rootManifest,
                blobs: [],
                message: { kind: 'None' as const },
                children: [childSubintentHash.hash]
              },
              nonRootSubintents: [childSubintent]
            }

            // 7. Map signatures to tx-tool format
            const childSigs = signatures.map((sig) => ({
              curve: (sig.keyType === 'ed25519'
                ? 'Ed25519'
                : 'Secp256k1') as schemas.Ed25519SignatureWithPublicKey['curve'],
              signature: new Uint8Array(Buffer.from(sig.signatureHex, 'hex')),
              publicKey: new Uint8Array(Buffer.from(sig.publicKeyHex, 'hex'))
            }))

            // 8. Get intent hash
            const { id } = yield* intentHashSvc.create(intent)

            // 9. Compile + submit (no polling)
            const compiled = yield* compile({
              intent,
              signatures: [],
              subintentSignatures: [childSigs]
            })
            yield* submit({ compiledTransaction: compiled })

            return { intentHash: id }
          }).pipe(
            Effect.provide(AppLayer),
            Effect.mapError(
              (e) =>
                new TransactionSubmitError({
                  message: `Transaction failed: ${String(e)}`
                })
            )
          ),

        previewSubintent: (
          partialTransactionHex: string
        ): Effect.Effect<PreviewSubintentResult, TransactionSubmitError> =>
          Effect.gen(function* () {
            const headerV2Service = yield* TransactionHeaderV2
            const previewV2 = yield* PreviewTransactionV2

            // 1. Decompile stored partial transaction
            const partialBytes = Convert.HexString.toUint8Array(
              partialTransactionHex
            )
            const partialTx = yield* Effect.tryPromise(() =>
              RadixEngineToolkit.PartialTransactionV2.decompile(
                partialBytes,
                networkId
              )
            )

            // 2. Hash child subintent
            const childSubintentHash = yield* Effect.tryPromise(() =>
              RadixEngineToolkit.SubintentV2.hash(partialTx.rootSubintent)
            )

            // 3. Get V2 headers (auto-fills epoch from current ledger)
            const { transactionHeader, intentHeader } = yield* headerV2Service({
              networkId: NetworkId.make(networkId),
              startEpochInclusive: Option.none(),
              endEpochExclusive: Option.none(),
              notaryIsSignatory: true
            })

            // 4. Root manifest: USE_CHILD + lock_fee + YIELD_TO_CHILD
            const rootManifest = TransactionManifestString.make(
              `USE_CHILD
  NamedIntent("withdrawal")
  Intent("${childSubintentHash.id}")
;
CALL_METHOD
  Address("${feePayerAddress}")
  "lock_fee"
  Decimal("10")
;
YIELD_TO_CHILD
  NamedIntent("withdrawal")
;
`
            )

            // 5. Adapt decompiled subintent to tx-tool branded types
            const childCore = partialTx.rootSubintent.intentCore
            const childSubintent = {
              intentCore: {
                header: {
                  networkId: NetworkId.make(childCore.header.networkId),
                  startEpochInclusive: Epoch.make(
                    childCore.header.startEpochInclusive
                  ),
                  endEpochExclusive: Epoch.make(
                    childCore.header.endEpochExclusive
                  ),
                  intentDiscriminator: childCore.header.intentDiscriminator,
                  ...(childCore.header.minProposerTimestampInclusive !==
                    undefined && {
                    minProposerTimestampInclusive:
                      childCore.header.minProposerTimestampInclusive
                  }),
                  ...(childCore.header.maxProposerTimestampExclusive !==
                    undefined && {
                    maxProposerTimestampExclusive:
                      childCore.header.maxProposerTimestampExclusive
                  })
                },
                instructions: TransactionManifestString.make(
                  childCore.instructions as string
                ),
                blobs: [...childCore.blobs],
                message: childCore.message as schemas.TransactionMessageV2,
                children: [...childCore.children]
              }
            } satisfies schemas.SubintentV2

            // 6. Build TransactionIntentV2 — override root intent epoch
            //    range to match child so they overlap for preview
            //    (skip_epoch_check handles the expired-epoch case).
            const previewIntentHeader = {
              ...intentHeader,
              startEpochInclusive: Epoch.make(
                childCore.header.startEpochInclusive
              ),
              endEpochExclusive: Epoch.make(childCore.header.endEpochExclusive)
            }
            const intent: schemas.TransactionIntentV2 = {
              transactionHeader,
              rootIntentCore: {
                header: previewIntentHeader,
                instructions: rootManifest,
                blobs: [],
                message: { kind: 'None' as const },
                children: [childSubintentHash.hash]
              },
              nonRootSubintents: [childSubintent]
            }

            // 7. Build PreviewTransactionV2 and compile to hex
            const previewTx = {
              transactionIntent: intent,
              rootSignerPublicKeys: [] as Array<{
                curve: 'Ed25519' | 'Secp256k1'
                publicKey: Uint8Array
              }>,
              nonRootSubintentSignerPublicKeys: [[]] as Array<
                Array<{
                  curve: 'Ed25519' | 'Secp256k1'
                  publicKey: Uint8Array
                }>
              >
            }
            const compiledBytes = yield* Effect.tryPromise(() =>
              RadixEngineToolkit.PreviewTransactionV2.compile(
                previewTx as unknown as RETPreviewTransactionV2
              )
            )
            const previewTransactionHex =
              Convert.Uint8Array.toHexString(compiledBytes)

            // 8. Call gateway PreviewTransactionV2
            const result = yield* previewV2({
              payload: {
                preview_transaction: {
                  type: 'Compiled',
                  preview_transaction_hex: previewTransactionHex
                },
                flags: {
                  assume_all_signature_proofs: true,
                  use_free_credit: true,
                  skip_epoch_check: true
                },
                opt_ins: {
                  radix_engine_toolkit_receipt: true,
                  logs: true,
                  core_api_receipt: true
                }
              }
            })

            // V2 preview returns receipt data in radix_engine_toolkit_receipt
            // (when opted in), while `receipt` may be null/undefined.
            const receipt =
              (result.radix_engine_toolkit_receipt as
                | Record<string, unknown>
                | undefined) ??
              (result.receipt as Record<string, unknown> | undefined)

            // Static analysis of the child subintent manifest to extract
            // which accounts are withdrawn from / deposited into.
            const analysis = yield* Effect.tryPromise(() =>
              RadixEngineToolkit.SubintentV2.staticallyAnalyze(
                childSubintent as unknown as RETSubintentV2
              )
            )

            const accountInteractions: AccountInteraction[] = [
              ...analysis.accounts_withdrawn_from.map((accountAddress) => ({
                accountAddress,
                direction: 'withdraw' as const
              })),
              ...analysis.accounts_deposited_into.map((accountAddress) => ({
                accountAddress,
                direction: 'deposit' as const
              }))
            ]

            return {
              receipt,
              logs: (result.logs ?? []).map((l) => ({
                level: l.level,
                message: l.message
              })),
              accountInteractions
            }
          }).pipe(
            Effect.provide(AppLayer),
            Effect.mapError(
              (e) =>
                new TransactionSubmitError({
                  message: `Preview failed: ${String(e)}`
                })
            )
          )
      })
    )
  })
)
