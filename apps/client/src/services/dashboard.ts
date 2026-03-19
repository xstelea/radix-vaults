import { TeamId } from '@radix-vaults/shared'
import { Effect } from 'effect'
import { AppApiClient } from '@/lib/apiClient'

export class DashboardService extends Effect.Service<DashboardService>()(
  '@radix-vaults/client/DashboardService',
  {
    dependencies: [AppApiClient.Default],
    effect: Effect.gen(function* () {
      const client = yield* AppApiClient
      return {
        listPending: (teamId: string) =>
          client.dashboard.pendingProposals({
            path: { teamId: TeamId.make(teamId) }
          })
      }
    })
  }
) {}
