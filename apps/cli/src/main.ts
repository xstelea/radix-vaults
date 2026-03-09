import { GatewayApiClient } from '@radix-effects/gateway'
import { ConfigProvider, Effect, Layer, Logger } from 'effect'
import { readBootstrapConfig, readFeePayerKey } from './config'
import { runBootstrap } from './bootstrap'
import { TransactionService } from './transactionService'

const main = Effect.gen(function* () {
  const configPath = process.argv[2] ?? 'bootstrap.json'

  yield* Effect.logInfo(`Reading config from ${configPath}...`)

  const config = yield* readBootstrapConfig(configPath)
  const feePayerKeyHex = yield* readFeePayerKey

  yield* Effect.logInfo(
    `Network: ${config.networkId === 1 ? 'mainnet' : 'stokenet'}`
  )
  yield* Effect.logInfo(
    `Signers: ${config.signers.length}, Threshold: ${config.threshold}`
  )
  yield* Effect.logInfo(`Badge recipients: ${config.badgeRecipients.length}`)

  const result = yield* runBootstrap(config, feePayerKeyHex)

  yield* Effect.logInfo('Bootstrap complete!')
  yield* Effect.logInfo('')
  yield* Effect.logInfo('Add these to your .env:')
  yield* Effect.logInfo(`TEAM_ACCOUNT_ADDRESS=${result.teamAccountAddress}`)
  yield* Effect.logInfo(
    `TEAM_MEMBER_BADGE_ADDRESS=${result.teamMemberBadgeAddress}`
  )

  // Also output as plain stdout for piping
  console.log(
    JSON.stringify(
      {
        TEAM_ACCOUNT_ADDRESS: result.teamAccountAddress,
        TEAM_MEMBER_BADGE_ADDRESS: result.teamMemberBadgeAddress
      },
      null,
      2
    )
  )
})

const GatewayLayer = GatewayApiClient.Default.pipe(
  Layer.provide(
    Layer.setConfigProvider(
      ConfigProvider.fromEnv().pipe(
        ConfigProvider.orElse(() => ConfigProvider.fromJson({ NETWORK_ID: 2 }))
      )
    )
  )
)

const AppLayer = TransactionService.Default.pipe(Layer.provide(GatewayLayer))

Effect.runPromise(
  main.pipe(Effect.provide(AppLayer), Effect.provide(Logger.pretty))
).catch((e) => {
  console.error('Bootstrap failed:', e)
  process.exit(1)
})
