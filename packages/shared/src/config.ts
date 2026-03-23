import { Config, Context, Effect, Layer } from 'effect'

export class AuthConfig extends Context.Tag('@radix-vaults/shared/AuthConfig')<
  AuthConfig,
  {
    readonly networkId: number
    readonly dAppDefinitionAddress: string
    readonly expectedOrigin: string
  }
>() {
  static layer = (config: {
    networkId: number
    dAppDefinitionAddress: string
    expectedOrigin: string
  }) => Layer.succeed(this, config)

  static Live = Layer.effect(
    this,
    Effect.gen(function* () {
      const networkId = yield* Config.integer('NETWORK_ID')
      const dAppDefinitionAddress = yield* Config.string(
        'DAPP_DEFINITION_ADDRESS'
      )
      const expectedOrigin = yield* Config.string('EXPECTED_ORIGIN')
      return {
        networkId,
        dAppDefinitionAddress,
        expectedOrigin
      }
    })
  )
}
