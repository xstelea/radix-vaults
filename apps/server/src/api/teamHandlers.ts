import { HttpApiBuilder } from '@effect/platform'
import { AppApi, AuthConfig } from '@radix-vaults/shared'
import {
  GetEntityDetailsVaultAggregated,
  GetResourceHoldersService
} from '@radix-effects/gateway'
import { Effect, Layer } from 'effect'
import { AccessRuleValidator } from '../gateway/accessRuleValidator'
import { GatewayApiClientLayer } from '../gateway/gatewayApiClient'
import { TeamHandler } from '../handlers/team'

export const TeamHandlersLive = HttpApiBuilder.group(
  AppApi,
  'team',
  (handlers) =>
    handlers.handle('overview', () =>
      Effect.gen(function* () {
        const team = yield* TeamHandler
        return yield* team.getOverview()
      })
    )
).pipe(
  Layer.provide(TeamHandler.Default),
  Layer.provide(AccessRuleValidator.Default),
  Layer.provide(GetEntityDetailsVaultAggregated.Default),
  Layer.provide(GetResourceHoldersService.Default),
  Layer.provide(AuthConfig.Live),
  Layer.provide(GatewayApiClientLayer)
)
