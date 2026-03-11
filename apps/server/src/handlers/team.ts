import type {
  AccountAddress,
  SetSignerSourceResponse,
  TeamMembers,
  TeamOverview
} from '@radix-vaults/shared'
import { AuthConfig, VaultsConfig } from '@radix-vaults/shared'
import { GetResourceHoldersService } from '@radix-effects/gateway'
import { Effect } from 'effect'
import { AccessRuleValidator } from '../gateway/accessRuleValidator'
import { SignerSourceRepo } from './signerSourceRepo'

const ED25519_RESOURCE_SUFFIX = 'ed25sg'
const SECP256K1_RESOURCE_SUFFIX = 'ecdsa'

const keyTypeFromResource = (
  resourceAddress: string
): 'ed25519' | 'secp256k1' =>
  resourceAddress.includes(ED25519_RESOURCE_SUFFIX) ? 'ed25519' : 'secp256k1'

export const computeMismatch = (
  onChainSigners: ReadonlyArray<{ resourceAddress: string; localId: string }>,
  registeredSources: ReadonlyArray<{ keyType: string }>
): boolean => {
  if (onChainSigners.length !== registeredSources.length) return true

  const onChainCounts = { ed25519: 0, secp256k1: 0 }
  for (const signer of onChainSigners) {
    onChainCounts[keyTypeFromResource(signer.resourceAddress)]++
  }

  const registeredCounts = { ed25519: 0, secp256k1: 0 }
  for (const source of registeredSources) {
    if (source.keyType === 'ed25519') registeredCounts.ed25519++
    else registeredCounts.secp256k1++
  }

  return (
    onChainCounts.ed25519 !== registeredCounts.ed25519 ||
    onChainCounts.secp256k1 !== registeredCounts.secp256k1
  )
}

export class TeamHandler extends Effect.Service<TeamHandler>()(
  '@radix-vaults/server/handlers/TeamHandler',
  {
    effect: Effect.gen(function* () {
      const config = yield* VaultsConfig
      const authConfig = yield* AuthConfig
      const accessRuleValidator = yield* AccessRuleValidator
      const signerSourceRepo = yield* SignerSourceRepo
      const getResourceHolders = yield* GetResourceHoldersService

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

          const sources = yield* signerSourceRepo.list()
          const memberSignerSources = sources.map((s) => ({
            accountAddress: s.accountAddress,
            publicKey: s.publicKey,
            keyType: s.keyType as 'ed25519' | 'secp256k1'
          }))

          const hasMismatch = computeMismatch(
            accessRule.signers,
            memberSignerSources
          )

          return {
            teamAccountAddress: config.teamAccountAddress,
            threshold,
            signers,
            memberSignerSources,
            hasMismatch
          } satisfies TeamOverview
        })

      const setSignerSource = (
        accountAddress: AccountAddress,
        publicKey: string,
        keyType: 'ed25519' | 'secp256k1'
      ): Effect.Effect<SetSignerSourceResponse> =>
        Effect.gen(function* () {
          const result = yield* signerSourceRepo.set(
            accountAddress,
            publicKey,
            keyType
          )
          return {
            accountAddress: result.accountAddress,
            publicKey: result.publicKey,
            keyType: result.keyType
          } satisfies SetSignerSourceResponse
        })

      const clearSignerSource = (accountAddress: AccountAddress) =>
        signerSourceRepo
          .clear(accountAddress)
          .pipe(Effect.as({ ok: true as const }))

      const getMembers = (): Effect.Effect<TeamMembers> =>
        getResourceHolders({
          resourceAddress: authConfig.teamMemberBadgeAddress
        }).pipe(
          Effect.map((items) => ({
            badgeAddress: authConfig.teamMemberBadgeAddress,
            members: items
              .filter(
                (
                  item
                ): item is Extract<typeof item, { type: 'FungibleResource' }> =>
                  item.type === 'FungibleResource'
              )
              .map((item) => ({
                holderAddress: item.holder_address,
                amount: item.amount
              }))
          })),
          Effect.orDie
        )

      return {
        getOverview,
        setSignerSource,
        clearSignerSource,
        getMembers
      } as const
    })
  }
) {}
