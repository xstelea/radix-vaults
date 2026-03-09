import { GetEntityDetailsVaultAggregated } from '@radix-effects/gateway'
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

// --- Parsed access rule types ---

export type ParsedSigner = {
  resourceAddress: string
  localId: string
}

export type ParsedAccessRule =
  | { type: 'CountOf'; count: number; signers: ParsedSigner[] }
  | { type: 'AllOf'; signers: ParsedSigner[] }

// --- Access rule parsing (from Gateway API JSON) ---

const parseNonFungible = (item: unknown): ParsedSigner | null => {
  if (
    typeof item !== 'object' ||
    item === null ||
    !('type' in item) ||
    (item as { type: string }).type !== 'NonFungible'
  )
    return null

  const nf = (item as { non_fungible?: unknown }).non_fungible
  if (typeof nf !== 'object' || nf === null) return null

  const { resource_address, local_id } = nf as {
    resource_address?: string
    local_id?: string
  }
  if (typeof resource_address !== 'string' || typeof local_id !== 'string')
    return null

  return { resourceAddress: resource_address, localId: local_id }
}

const parseSignerList = (list: unknown): ParsedSigner[] | null => {
  if (!Array.isArray(list)) return null
  const signers: ParsedSigner[] = []
  for (const item of list) {
    const signer = parseNonFungible(item)
    if (!signer) return null
    signers.push(signer)
  }
  return signers.length > 0 ? signers : null
}

/**
 * Parses the Gateway API's JSON representation of an OwnerRole into a supported
 * access rule (CountOf or AllOf of NonFungible signature badges).
 *
 * Expected JSON shape:
 * {
 *   "rule": {
 *     "type": "Protected",
 *     "access_rule": {
 *       "type": "ProofRule",
 *       "proof_rule": { "type": "CountOf"|"AllOf", ... }
 *     }
 *   },
 *   "updater": "None"|"Owner"|"Object"
 * }
 */
export const parseOwnerAccessRule = (
  ownerJson: unknown
): ParsedAccessRule | null => {
  if (typeof ownerJson !== 'object' || ownerJson === null) return null

  const { rule } = ownerJson as { rule?: unknown }
  if (typeof rule !== 'object' || rule === null) return null

  const ruleObj = rule as { type?: string; access_rule?: unknown }
  if (ruleObj.type !== 'Protected') return null

  const accessRule = ruleObj.access_rule as {
    type?: string
    proof_rule?: unknown
  }
  if (typeof accessRule !== 'object' || accessRule === null) return null
  if (accessRule.type !== 'ProofRule') return null

  const proofRule = accessRule.proof_rule as {
    type?: string
    count?: number
    list?: unknown
  }
  if (typeof proofRule !== 'object' || proofRule === null) return null

  if (proofRule.type === 'CountOf') {
    if (typeof proofRule.count !== 'number') return null
    const signers = parseSignerList(proofRule.list)
    if (!signers) return null
    return { type: 'CountOf', count: proofRule.count, signers }
  }

  if (proofRule.type === 'AllOf') {
    const signers = parseSignerList(proofRule.list)
    if (!signers) return null
    return { type: 'AllOf', signers }
  }

  return null
}

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
