import { AuthConfig } from '@radix-vaults/shared'
import { Data, Effect } from 'effect'

const GATEWAY_URLS: Record<number, string> = {
  1: 'https://mainnet.radixdlt.com',
  2: 'https://stokenet.radixdlt.com'
}

export class BadgeCheckError extends Data.TaggedError('BadgeCheckError')<{
  reason: string
}> {}

export class NoBadgeError extends Data.TaggedError('NoBadgeError')<{
  accountAddress: string
}> {}

export class BadgeChecker extends Effect.Service<BadgeChecker>()(
  '@radix-vaults/server/auth/BadgeChecker',
  {
    effect: Effect.gen(function* () {
      const config = yield* AuthConfig
      const gatewayUrl = GATEWAY_URLS[config.networkId] ?? GATEWAY_URLS[2]!

      const hasBadge = (
        accountAddress: string
      ): Effect.Effect<void, NoBadgeError | BadgeCheckError> =>
        Effect.tryPromise({
          try: async () => {
            const res = await fetch(
              `${gatewayUrl}/state/entity/page/fungible-vaults/`,
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  address: accountAddress,
                  resource_address: config.teamMemberBadgeAddress
                })
              }
            )
            if (!res.ok) {
              throw new Error(`Gateway returned ${res.status}`)
            }
            return (await res.json()) as {
              items?: { vault_address: string; amount: string }[]
            }
          },
          catch: (e) =>
            new BadgeCheckError({
              reason: `Failed to query badge balance: ${e instanceof Error ? e.message : String(e)}`
            })
        }).pipe(
          Effect.flatMap((data) => {
            const items = data.items ?? []
            const totalBalance = items.reduce(
              (sum, item) => sum + Number(item.amount ?? '0'),
              0
            )
            if (totalBalance <= 0) {
              return Effect.fail(new NoBadgeError({ accountAddress }))
            }
            return Effect.void
          })
        )

      return { hasBadge } as const
    })
  }
) {}
