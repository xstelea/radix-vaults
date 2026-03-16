import { GetEntityDetailsVaultAggregated } from '@radix-effects/gateway'
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
      const getEntityDetails = yield* GetEntityDetailsVaultAggregated

      const hasBadge = (
        accountAddress: AccountAddress
      ): Effect.Effect<void, NoBadgeError | BadgeCheckError> =>
        getEntityDetails([accountAddress], undefined, undefined).pipe(
          Effect.mapError(
            (error) =>
              new BadgeCheckError({
                reason: `Failed to query entity details: ${error._tag}`
              })
          ),
          Effect.flatMap((results) => {
            const entity = results[0]
            if (!entity) {
              return Effect.fail(new NoBadgeError({ accountAddress }))
            }

            const nfResources = entity.non_fungible_resources?.items ?? []
            const hasBadgeResource = nfResources.some(
              (r: { resource_address?: string }) =>
                r.resource_address === config.teamMemberBadgeAddress
            )

            if (!hasBadgeResource) {
              return Effect.fail(new NoBadgeError({ accountAddress }))
            }
            return Effect.void
          })
        )

      return { hasBadge } as const
    })
  }
) {}
