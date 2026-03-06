import { GatewayApiClient } from '@radix-effects/gateway'
import { Config, ConfigProvider, Data, Effect, Layer } from 'effect'

export class UnsupportedNetworkIdError extends Data.TaggedError(
  'UnsupportedNetworkIdError'
)<{
  message: string
}> {}

export const GatewayApiClientLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const networkId = yield* Config.number('NETWORK_ID').pipe(Effect.orDie)

    if (networkId === 1) {
      return GatewayApiClient.Default
    }

    if (networkId === 2) {
      return GatewayApiClient.Default.pipe(
        Layer.provide(
          Layer.setConfigProvider(
            ConfigProvider.fromJson({ NETWORK_ID: 2 }).pipe(
              ConfigProvider.orElse(() => ConfigProvider.fromEnv())
            )
          )
        )
      )
    }

    return yield* new UnsupportedNetworkIdError({
      message: `Unsupported NETWORK_ID: ${networkId}`
    })
  })
)
