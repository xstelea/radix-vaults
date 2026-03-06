import { Effect } from 'effect'

export class AuthService extends Effect.Service<AuthService>()(
  '@radix-vaults/client/AuthService',
  {
    succeed: {
      createChallenge: () =>
        Effect.tryPromise({
          try: () =>
            fetch('/auth/challenge').then(
              (r) => r.json() as Promise<{ challenge: string }>
            ),
          catch: () => new Error('Failed to create challenge')
        }).pipe(Effect.map((r) => r.challenge)),

      verify: (signedChallenges: unknown[]) =>
        Effect.tryPromise({
          try: () =>
            fetch('/auth/verify', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ signedChallenges })
            }).then(async (r) => {
              const body = await r.json()
              if (!r.ok) throw new Error(body.error ?? 'Verification failed')
              return body as { accountAddress: string; expiresAt: string }
            }),
          catch: (e) =>
            e instanceof Error ? e : new Error('Verification failed')
        }),

      getSession: () =>
        Effect.tryPromise({
          try: () =>
            fetch('/auth/session').then(async (r) => {
              if (!r.ok) return null
              const body = await r.json()
              return body as { accountAddress: string } | null
            }),
          catch: () => new Error('Failed to check session')
        }),

      logout: () =>
        Effect.tryPromise({
          try: () => fetch('/auth/logout', { method: 'POST' }),
          catch: () => new Error('Failed to logout')
        }).pipe(Effect.asVoid)
    }
  }
) {}
