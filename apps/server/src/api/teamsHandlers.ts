import { HttpApiBuilder } from '@effect/platform'
import { AppApi, CurrentSession } from '@radix-vaults/shared'
import { Effect, Layer } from 'effect'
import { TeamsHandler } from '../handlers/teams'

export const TeamsHandlersLive = HttpApiBuilder.group(
  AppApi,
  'teams',
  (handlers) =>
    handlers
      .handle('createTeam', ({ payload }) =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const teamsHandler = yield* TeamsHandler
          return yield* teamsHandler.createTeam(
            payload.name,
            payload.virtualBadge,
            payload.memberName,
            session.accountAddress
          )
        })
      )
      .handle('list', () =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const teamsHandler = yield* TeamsHandler
          return yield* teamsHandler.listByMember(session.accountAddress)
        })
      )
).pipe(Layer.provide(TeamsHandler.Default))
