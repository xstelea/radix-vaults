import { HttpApiBuilder } from '@effect/platform'
import { AppApi } from '@radix-vaults/shared'
import { Effect, Layer } from 'effect'
import { ProposalRepo } from '../handlers/proposalRepo'
import { TeamHandler } from '../handlers/team'

export const DashboardHandlersLive = HttpApiBuilder.group(
  AppApi,
  'dashboard',
  (handlers) =>
    handlers.handle('pendingProposals', ({ path: { teamId } }) =>
      Effect.gen(function* () {
        const repo = yield* ProposalRepo
        const teamHandler = yield* TeamHandler
        const [proposals, overview] = yield* Effect.all([
          repo.listAllPending(teamId),
          teamHandler.getOverview(teamId)
        ])

        const nameByAddress = new Map(
          overview.badgeHolders.map((h) => [h.holderAddress, h.name])
        )

        return proposals.map((p) => ({
          ...p,
          createdByName: nameByAddress.get(p.createdBy) ?? null,
          entityName:
            p.entityName ?? (p.type !== 'vault' ? 'Team' : p.entityName)
        }))
      })
    )
).pipe(Layer.provide(TeamHandler.Default))
