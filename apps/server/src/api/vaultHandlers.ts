import { HttpApiBuilder } from '@effect/platform'
import { AppApi, CurrentSession } from '@radix-vaults/shared'
import { Effect, Layer } from 'effect'
import { TeamMembershipChecker } from '../auth/teamMembershipChecker'
import { VaultsHandler } from '../handlers/vaults'

export const VaultHandlersLive = HttpApiBuilder.group(
  AppApi,
  'vaults',
  (handlers) =>
    handlers
      .handle('list', ({ path: { teamId } }) =>
        Effect.gen(function* () {
          const vaults = yield* VaultsHandler
          return yield* vaults.list(teamId)
        })
      )
      .handle('detail', ({ path: { teamId, vaultAddress } }) =>
        Effect.gen(function* () {
          const vaults = yield* VaultsHandler
          return yield* vaults.getDetail(teamId, vaultAddress)
        })
      )
      .handle('signers', ({ path: { teamId, vaultAddress } }) =>
        Effect.gen(function* () {
          const vaults = yield* VaultsHandler
          return yield* vaults.getSigners(teamId, vaultAddress)
        })
      )
      .handle(
        'importVault',
        ({ path: { teamId }, payload: { accountAddress, name } }) =>
          Effect.gen(function* () {
            const session = yield* CurrentSession
            const checker = yield* TeamMembershipChecker
            yield* checker.check(teamId, session.accountAddress)
            const vaults = yield* VaultsHandler
            return yield* vaults.importVault(teamId, accountAddress, name)
          })
      )
      .handle(
        'createVault',
        ({ path: { teamId }, payload: { name, threshold } }) =>
          Effect.gen(function* () {
            const session = yield* CurrentSession
            const checker = yield* TeamMembershipChecker
            yield* checker.check(teamId, session.accountAddress)
            const vaults = yield* VaultsHandler
            return yield* vaults.createVault(teamId, name, threshold)
          })
      )
).pipe(
  Layer.provide(VaultsHandler.Default),
  Layer.provide(TeamMembershipChecker.Default)
)
