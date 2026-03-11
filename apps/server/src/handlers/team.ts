import type { TeamOverview } from '@radix-vaults/shared'
import { VaultsConfig } from '@radix-vaults/shared'
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
      const config = yield* VaultsConfig
      const accessRuleValidator = yield* AccessRuleValidator

      const getOverview = (): Effect.Effect<TeamOverview> =>
        Effect.gen(function* () {
          const accessRule = yield* accessRuleValidator
            .validate(config.teamAccountAddress)
            .pipe(Effect.orDie)

          const threshold =
            accessRule.type === 'CountOf'
              ? accessRule.count
              : accessRule.signers.length

          const signers = accessRule.signers.map((s) => ({
            signerPublicKey: s.localId,
            signerKeyType: keyTypeFromResource(s.resourceAddress),
            signerKeyHash: s.localId
          }))

          return {
            teamAccountAddress: config.teamAccountAddress,
            threshold,
            signers
          } satisfies TeamOverview
        })

      return { getOverview } as const
    })
  }
) {}
