import { GetEntityDetailsVaultAggregated } from '@radix-effects/gateway'
import {
  parseOwnerAccessRule,
  type ParsedAccessRule,
  type ParsedSigner
} from '@radix-vaults/shared'
import { Data, Effect } from 'effect'

// --- Errors ---

export class EntityNotFoundOnLedgerError extends Data.TaggedError(
  'EntityNotFoundOnLedgerError'
)<{
  entityAddress: string
}> {}

export class UnsupportedRuleError extends Data.TaggedError(
  'UnsupportedRuleError'
)<{
  entityAddress: string
  reason: string
}> {}

export { parseOwnerAccessRule }
export type { ParsedSigner, ParsedAccessRule }

// --- Service ---

export class AccessRuleValidator extends Effect.Service<AccessRuleValidator>()(
  '@radix-vaults/server/gateway/AccessRuleValidator',
  {
    effect: Effect.gen(function* () {
      const getEntityDetails = yield* GetEntityDetailsVaultAggregated

      const validate = (
        entityAddress: string
      ): Effect.Effect<
        ParsedAccessRule,
        EntityNotFoundOnLedgerError | UnsupportedRuleError
      > =>
        Effect.gen(function* () {
          const details = yield* getEntityDetails(
            [entityAddress],
            undefined,
            undefined
          ).pipe(
            Effect.mapError(
              () =>
                new EntityNotFoundOnLedgerError({
                  entityAddress
                })
            )
          )

          const entity = details[0]
          if (!entity) {
            return yield* new EntityNotFoundOnLedgerError({ entityAddress })
          }

          const entityDetails = entity.details
          if (
            !entityDetails ||
            (entityDetails.type !== 'Component' &&
              entityDetails.type !== 'FungibleResource') ||
            !entityDetails.role_assignments
          ) {
            return yield* new UnsupportedRuleError({
              entityAddress,
              reason: 'Entity has no role assignments'
            })
          }

          const ownerRole = entityDetails.role_assignments.owner
          const parsed = parseOwnerAccessRule(ownerRole)
          if (!parsed) {
            return yield* new UnsupportedRuleError({
              entityAddress,
              reason:
                'Owner access rule is not a supported format (expected CountOf or AllOf of signature badges)'
            })
          }

          return parsed
        })

      return { validate } as const
    })
  }
) {}
