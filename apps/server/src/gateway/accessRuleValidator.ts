import { GetEntityDetailsVaultAggregated } from '@radix-effects/gateway'
import {
  parseOwnerAccessRule,
  type ParsedAccessRule,
  type ParsedSigner
} from '@radix-vaults/shared'
import type { VaultAddress } from '@radix-vaults/shared'
import { Data, Effect } from 'effect'

// --- Errors ---

export class EntityNotFoundOnLedgerError extends Data.TaggedError(
  'EntityNotFoundOnLedgerError'
)<{
  accountAddress: string
}> {}

export class UnsupportedRuleError extends Data.TaggedError(
  'UnsupportedRuleError'
)<{
  accountAddress: string
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
        accountAddress: VaultAddress
      ): Effect.Effect<
        ParsedAccessRule,
        EntityNotFoundOnLedgerError | UnsupportedRuleError
      > =>
        Effect.gen(function* () {
          const details = yield* getEntityDetails(
            [accountAddress],
            undefined,
            undefined
          ).pipe(
            Effect.mapError(
              () =>
                new EntityNotFoundOnLedgerError({
                  accountAddress
                })
            )
          )

          const entity = details[0]
          if (!entity) {
            return yield* new EntityNotFoundOnLedgerError({ accountAddress })
          }

          const componentDetails = entity.details
          if (
            !componentDetails ||
            componentDetails.type !== 'Component' ||
            !componentDetails.role_assignments
          ) {
            return yield* new UnsupportedRuleError({
              accountAddress,
              reason: 'Entity is not an account or has no role assignments'
            })
          }

          const ownerRole = componentDetails.role_assignments.owner
          const parsed = parseOwnerAccessRule(ownerRole)
          if (!parsed) {
            return yield* new UnsupportedRuleError({
              accountAddress,
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
