import { Effect } from 'effect'
import { AppApiClient } from '@/lib/apiClient'

export class TeamService extends Effect.Service<TeamService>()(
  '@radix-vaults/client/TeamService',
  {
    dependencies: [AppApiClient.Default],
    effect: Effect.gen(function* () {
      const client = yield* AppApiClient
      return {
        getOverview: () => client.team.overview(),
        setSignerSource: (
          publicKey: string,
          keyType: 'ed25519' | 'secp256k1'
        ) =>
          client.team.setSignerSource({
            payload: { publicKey, keyType }
          }),
        clearSignerSource: () => client.team.clearSignerSource()
      }
    })
  }
) {}
