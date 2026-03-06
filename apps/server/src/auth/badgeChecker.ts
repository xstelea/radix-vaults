import { GetFungibleBalance } from '@radix-effects/gateway'
import { type AccountAddress, AuthConfig } from '@radix-vaults/shared'
import { Data, Effect } from 'effect'

export class BadgeCheckError extends Data.TaggedError('BadgeCheckError')<{
  reason: string
}> {}

export class NoBadgeError extends Data.TaggedError('NoBadgeError')<{
  accountAddress: AccountAddress
}> {}

export class BadgeChecker extends Effect.Service<BadgeChecker>()(
  '@radix-vaults/server/auth/BadgeChecker',
  {
    effect: Effect.gen(function* () {
      const config = yield* AuthConfig
      const getFungibleBalance = yield* GetFungibleBalance

      const hasBadge = (
        accountAddress: AccountAddress
      ): Effect.Effect<void, NoBadgeError | BadgeCheckError> =>
        getFungibleBalance({
          addresses: [accountAddress]
        }).pipe(
          Effect.mapError(
            (error) =>
              new BadgeCheckError({
                reason: `Failed to query badge balance: ${error._tag}`
              })
          ),
          Effect.flatMap((results) => {
            const hasBadgeBalance = results.some((result) =>
              result.items.some(
                (item) =>
                  item.resource_address === config.teamMemberBadgeAddress
              )
            )
            if (!hasBadgeBalance) {
              return Effect.fail(new NoBadgeError({ accountAddress }))
            }
            return Effect.void
          })
        )

      return { hasBadge } as const
    })
  }
) {}
