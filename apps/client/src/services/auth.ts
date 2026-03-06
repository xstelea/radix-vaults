import { type VerifyRequestSchema } from '@radix-vaults/shared'
import { Effect } from 'effect'
import { AppApiClient } from '@/lib/apiClient'

export class AuthService extends Effect.Service<AuthService>()(
  '@radix-vaults/client/AuthService',
  {
    dependencies: [AppApiClient.Default],
    effect: Effect.gen(function* () {
      const client = yield* AppApiClient
      return {
        createChallenge: () =>
          client.auth.createChallenge().pipe(Effect.map((r) => r.challenge)),

        verify: (signedChallenge: unknown) =>
          client.auth.verify({
            payload: {
              signedChallenge
            } as typeof VerifyRequestSchema.Type
          }),

        getSession: () =>
          client.auth
            .getSession()
            .pipe(Effect.catchTag('Unauthorized', () => Effect.succeed(null))),

        logout: () => client.auth.logout().pipe(Effect.asVoid)
      }
    })
  }
) {}
