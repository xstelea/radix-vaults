import { HttpApiBuilder } from '@effect/platform'
import { AppApi } from '@radix-vaults/shared'
import { Effect, Layer } from 'effect'
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
).pipe(Layer.provide(TeamHandler.Default))
