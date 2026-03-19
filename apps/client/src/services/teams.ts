import { Effect } from 'effect'
import { AppApiClient } from '@/lib/apiClient'

export class TeamsService extends Effect.Service<TeamsService>()(
  '@radix-vaults/client/TeamsService',
  {
    dependencies: [AppApiClient.Default],
    effect: Effect.gen(function* () {
      const client = yield* AppApiClient
      return {
        list: () => client.teams.list(),
        createTeam: (name: string, virtualBadge: string, memberName: string) =>
          client.teams.createTeam({
            payload: { name, virtualBadge, memberName }
          })
      }
    })
  }
) {}
