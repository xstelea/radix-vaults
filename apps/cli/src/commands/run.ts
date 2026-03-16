import { Command, Options } from '@effect/cli'
import { GatewayApiClient } from '@radix-effects/gateway'
import { HexString } from '@radix-effects/shared'
import {
  CompileTransaction,
  CreateTransactionIntent,
  IntentHashService,
  Signer,
  SubmitTransaction,
  TransactionStatus
} from '@radix-effects/tx-tool'
import { PrivateKey, RadixEngineToolkit } from '@radixdlt/radix-engine-toolkit'
import { ConfigProvider, Effect, Layer, Redacted } from 'effect'
import { BootstrapError, runBootstrap } from '../bootstrap'
import { readBootstrapConfig, readFeePayerKey } from '../config'

const config = Options.text('config').pipe(
  Options.withDefault('bootstrap.json')
)

export const runCommand = Command.make('run', { config }, ({ config }) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Reading config from ${config}...`)

    const bootstrapConfig = yield* readBootstrapConfig(config)
    const feePayerKeyHex = yield* readFeePayerKey

    yield* Effect.logInfo(
      `Network: ${bootstrapConfig.networkId === 1 ? 'mainnet' : 'stokenet'}`
    )
    yield* Effect.logInfo(
      `Members: ${bootstrapConfig.members.length}, Threshold: ${bootstrapConfig.threshold}`
    )

    const feePayerAddress = yield* Effect.tryPromise({
      try: () =>
        RadixEngineToolkit.Derive.virtualAccountAddressFromPublicKey(
          new PrivateKey.Ed25519(feePayerKeyHex).publicKey(),
          bootstrapConfig.networkId
        ),
      catch: (e) =>
        new BootstrapError({
          message: `Failed to derive fee payer address: ${e}`
        })
    })

    const SignerLayer = Signer.makePrivateKeySigner(
      Redacted.make(HexString.make(feePayerKeyHex))
    )

    const TxLayer = Layer.mergeAll(
      CreateTransactionIntent.Default,
      CompileTransaction.Default,
      SubmitTransaction.Default,
      TransactionStatus.Default,
      IntentHashService.Default
    ).pipe(Layer.provide(SignerLayer), Layer.provide(GatewayLayer))

    const AppLayer = Layer.mergeAll(TxLayer, GatewayLayer, SignerLayer)

    const result = yield* runBootstrap(bootstrapConfig, feePayerAddress).pipe(
      Effect.provide(AppLayer)
    )

    yield* Effect.logInfo('Bootstrap complete!')
    yield* Effect.logInfo('')
    yield* Effect.logInfo('Add this to your .env:')
    yield* Effect.logInfo(
      `TEAM_MEMBER_BADGE_ADDRESS=${result.teamMemberBadgeAddress}`
    )

    console.log(
      JSON.stringify(
        {
          TEAM_MEMBER_BADGE_ADDRESS: result.teamMemberBadgeAddress
        },
        null,
        2
      )
    )
  })
)

const GatewayLayer = GatewayApiClient.Default.pipe(
  Layer.provide(
    Layer.setConfigProvider(
      ConfigProvider.fromEnv().pipe(
        ConfigProvider.orElse(() => ConfigProvider.fromJson({ NETWORK_ID: 2 }))
      )
    )
  )
)
