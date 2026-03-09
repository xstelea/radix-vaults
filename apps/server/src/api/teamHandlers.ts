import { HttpApiBuilder } from '@effect/platform'
import { AppApi, CurrentSession, VaultsConfig } from '@radix-vaults/shared'
import { GetEntityDetailsVaultAggregated } from '@radix-effects/gateway'
import { Effect, Layer } from 'effect'
import { ORM } from '../db/orm'
import { AccessRuleValidator } from '../gateway/accessRuleValidator'
import { GatewayApiClientLayer } from '../gateway/gatewayApiClient'
import { SignerSourceRepo } from '../handlers/signerSourceRepo'
import { TeamHandler } from '../handlers/team'

export const TeamHandlersLive = HttpApiBuilder.group(
  AppApi,
  'team',
  (handlers) =>
    handlers
      .handle('overview', () =>
        Effect.gen(function* () {
          const team = yield* TeamHandler
          return yield* team.getOverview()
        })
      )
      .handle('setSignerSource', ({ payload: { publicKey, keyType } }) =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const team = yield* TeamHandler
          return yield* team.setSignerSource(
            session.accountAddress,
            publicKey,
            keyType
          )
        })
      )
      .handle('clearSignerSource', () =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const team = yield* TeamHandler
          return yield* team.clearSignerSource(session.accountAddress)
        })
      )
).pipe(
  Layer.provide(TeamHandler.Default),
  Layer.provide(SignerSourceRepo.Default),
  Layer.provide(AccessRuleValidator.Default),
  Layer.provide(GetEntityDetailsVaultAggregated.Default),
  Layer.provide(ORM.Default),
  Layer.provide(VaultsConfig.Live),
  Layer.provide(GatewayApiClientLayer)
)
