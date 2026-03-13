import type { TeamOverview } from '@radix-vaults/shared'
import { AuthConfig } from '@radix-vaults/shared'
import { GetResourceHoldersService } from '@radix-effects/gateway'
import { Effect } from 'effect'
import { AccessRuleValidator } from '../gateway/accessRuleValidator'

const ED25519_RESOURCE_SUFFIX = 'ed25sg'

const keyTypeFromResource = (
  resourceAddress: string
): 'ed25519' | 'secp256k1' =>
  resourceAddress.includes(ED25519_RESOURCE_SUFFIX) ? 'ed25519' : 'secp256k1'

export class TeamHandler extends Effect.Service<TeamHandler>()(
  '@radix-vaults/server/handlers/TeamHandler',
  {
    effect: Effect.gen(function* () {
      const authConfig = yield* AuthConfig
      const accessRuleValidator = yield* AccessRuleValidator
      const getResourceHolders = yield* GetResourceHoldersService

      const getOverview = (): Effect.Effect<TeamOverview> =>
        Effect.gen(function* () {
          const accessRule = yield* accessRuleValidator
            .validate(authConfig.teamMemberBadgeAddress)
            .pipe(Effect.orDie)

          const threshold =
            accessRule.type === 'CountOf'
              ? accessRule.count
              : accessRule.signers.length

          const signers = accessRule.signers.map((s) => ({
            signerPublicKey: s.localId,
            signerKeyType: keyTypeFromResource(s.resourceAddress),
            signerKeyHash: s.localId,
            nonFungibleGlobalId: `${s.resourceAddress}:${s.localId}`
          }))

          const holders = yield* getResourceHolders({
            resourceAddress: authConfig.teamMemberBadgeAddress
          }).pipe(Effect.orDie)

          const badgeHolders = holders
            .filter((h) => h.type === 'FungibleResource')
            .map((h) => ({
              holderAddress: h.holder_address,
              amount: h.amount
            }))

          return {
            teamMemberBadgeAddress: authConfig.teamMemberBadgeAddress,
            threshold,
            signers,
            badgeHolders
          } satisfies TeamOverview
        })

      return { getOverview } as const
    })
  }
) {}
