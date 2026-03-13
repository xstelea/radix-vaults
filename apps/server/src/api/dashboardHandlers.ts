import { HttpApiBuilder } from '@effect/platform'
import { AppApi } from '@radix-vaults/shared'
import { Effect } from 'effect'
import { ProposalRepo } from '../handlers/proposalRepo'

export const DashboardHandlersLive = HttpApiBuilder.group(
  AppApi,
  'dashboard',
  (handlers) =>
    handlers.handle('pendingProposals', () =>
      Effect.gen(function* () {
        const repo = yield* ProposalRepo
        return yield* repo.listAllPending()
      })
    )
)
