import { Config, Context, Effect, Layer } from 'effect'
import {
  VaultAddress,
  type VaultAddress as VaultAddressType
} from './vaultAddress'

export class VaultsConfig extends Context.Tag('@radix-vaults/shared/Config')<
  VaultsConfig,
  {
    readonly teamAccountAddress: VaultAddressType
  }
>() {
  static layer = (teamAccountAddress: string) =>
    Layer.succeed(this, {
      teamAccountAddress: VaultAddress.make(teamAccountAddress)
    })

  static Live = Layer.effect(
    this,
    Effect.gen(function* () {
      const teamAccountAddress = yield* Config.string('TEAM_ACCOUNT_ADDRESS')
      return {
        teamAccountAddress: VaultAddress.make(teamAccountAddress)
      }
    })
  )
}
