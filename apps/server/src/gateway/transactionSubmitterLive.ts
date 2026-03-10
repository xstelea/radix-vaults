import { GatewayApiClient } from '@radix-effects/gateway'
import { HexString, TransactionManifestString } from '@radix-effects/shared'
import {
  CompileTransaction,
  CreateTransactionIntent,
  IntentHashService,
  Signer,
  SubmitTransaction,
  TransactionStatus
} from '@radix-effects/tx-tool'
import { PrivateKey, RadixEngineToolkit } from '@radixdlt/radix-engine-toolkit'
import { Config, ConfigProvider, Effect, Layer, Redacted } from 'effect'
import {
  TransactionSubmitError,
  TransactionSubmitter
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
      IntentHashService.Default
    ).pipe(Layer.provide(SignerLayer), Layer.provide(GatewayLayer))

    const AppLayer = Layer.mergeAll(TxLayer, GatewayLayer, SignerLayer)

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

        submitWithSigners: (_input) =>
          Effect.fail(
            new TransactionSubmitError({
              message: 'submitWithSigners not yet implemented'
            })
          )
      })
    )
  })
)
