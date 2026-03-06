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

export class AuthConfig extends Context.Tag('@radix-vaults/shared/AuthConfig')<
  AuthConfig,
  {
    readonly networkId: number
    readonly dAppDefinitionAddress: string
    readonly expectedOrigin: string
    readonly teamMemberBadgeAddress: string
  }
>() {
  static layer = (config: {
    networkId: number
    dAppDefinitionAddress: string
    expectedOrigin: string
    teamMemberBadgeAddress: string
  }) => Layer.succeed(this, config)

  static Live = Layer.effect(
    this,
    Effect.gen(function* () {
      const networkId = yield* Config.integer('NETWORK_ID')
      const dAppDefinitionAddress = yield* Config.string(
        'DAPP_DEFINITION_ADDRESS'
      )
      const expectedOrigin = yield* Config.string('EXPECTED_ORIGIN')
      const teamMemberBadgeAddress = yield* Config.string(
        'TEAM_MEMBER_BADGE_ADDRESS'
      )
      return {
        networkId,
        dAppDefinitionAddress,
        expectedOrigin,
        teamMemberBadgeAddress
      }
    })
  )
}
