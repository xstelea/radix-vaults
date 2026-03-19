import type { BadgeHolder, TeamOverview } from '@radix-vaults/shared'
import { TeamRepo } from './teamRepo'
import {
  GetEntityDetailsVaultAggregated,
  GetResourceHoldersService,
  NonFungibleData
} from '@radix-effects/gateway'
import { Effect } from 'effect'
import s from 'sbor-ez-mode'
import { AccessRuleValidator } from '../gateway/accessRuleValidator'

const BadgeNftSchema = s.struct({
  name: s.string(),
  mfa_virtual_resource: s.string()
})

const ED25519_RESOURCE_SUFFIX = 'ed25sg'

const keyTypeFromResource = (
  resourceAddress: string
): 'ed25519' | 'secp256k1' =>
  resourceAddress.includes(ED25519_RESOURCE_SUFFIX) ? 'ed25519' : 'secp256k1'

export class TeamHandler extends Effect.Service<TeamHandler>()(
  '@radix-vaults/server/handlers/TeamHandler',
  {
    effect: Effect.gen(function* () {
      const teamRepo = yield* TeamRepo
      const accessRuleValidator = yield* AccessRuleValidator
      const getResourceHolders = yield* GetResourceHoldersService
      const getEntityDetails = yield* GetEntityDetailsVaultAggregated
      const getNonFungibleData = yield* NonFungibleData

      const getOverview = (teamId: string): Effect.Effect<TeamOverview> =>
        Effect.gen(function* () {
          const team = yield* teamRepo.getById(teamId).pipe(Effect.orDie)

          // Fetch pending (unconfirmed) members from DB
          const allMembers = yield* teamRepo.getMembers(teamId)
          const pendingMembers = allMembers
            .filter((m) => !m.confirmed)
            .map((m) => ({
              accountAddress: m.accountAddress,
              createdAt: m.createdAt.toISOString()
            }))

          const accessRule = yield* accessRuleValidator
            .validate(team.badgeAddress)
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
            resourceAddress: team.badgeAddress
          }).pipe(Effect.orDie)

          const nftHolderAddresses = holders
            .filter((h) => h.type === 'NonFungibleResource')
            .map((h) => h.holder_address)

          if (nftHolderAddresses.length === 0) {
            return {
              teamMemberBadgeAddress: team.badgeAddress,
              threshold,
              signers,
              badgeHolders: [],
              pendingMembers
            } satisfies TeamOverview
          }

          // Get entity details to find NFT IDs per holder
          const entityDetails = yield* getEntityDetails(
            nftHolderAddresses,
            undefined,
            undefined
          ).pipe(Effect.orDie)

          // Extract holder → NFT local IDs mapping
          const holderNftMap = new Map<
            string,
            { holderAddress: string; localIds: string[] }
          >()
          const allLocalIds: string[] = []

          for (const entity of entityDetails) {
            const nfResources = entity.non_fungible_resources?.items ?? []
            const badgeResource = nfResources.find(
              (r: { resource_address?: string }) =>
                r.resource_address === team.badgeAddress
            ) as
              | {
                  vaults?: {
                    items?: Array<{ items?: string[]; vault_address?: string }>
                  }
                }
              | undefined

            const nftIds: string[] = []
            for (const vault of badgeResource?.vaults?.items ?? []) {
              for (const id of vault.items ?? []) {
                nftIds.push(id)
                allLocalIds.push(id)
              }
            }

            if (nftIds.length > 0) {
              holderNftMap.set(entity.address, {
                holderAddress: entity.address,
                localIds: nftIds
              })
            }
          }

          if (allLocalIds.length === 0) {
            return {
              teamMemberBadgeAddress: team.badgeAddress,
              threshold,
              signers,
              badgeHolders: [],
              pendingMembers
            } satisfies TeamOverview
          }

          // Fetch NFT data for all local IDs
          const nftDataItems = yield* getNonFungibleData({
            resource_address: team.badgeAddress,
            non_fungible_ids: allLocalIds
          }).pipe(Effect.orDie)

          // Build NFT data lookup: localId → parsed badge data
          const nftDataMap = new Map<
            string,
            { name: string; mfaVirtualResource: string }
          >()

          for (const item of nftDataItems) {
            const sbor = item.data?.programmatic_json
            if (!sbor) {
              nftDataMap.set(item.non_fungible_id, {
                name: '',
                mfaVirtualResource: ''
              })
              continue
            }

            const parsed = BadgeNftSchema.safeParse(sbor)
            nftDataMap.set(item.non_fungible_id, {
              name: parsed.isOk() ? parsed.value.name : '',
              mfaVirtualResource: parsed.isOk()
                ? parsed.value.mfa_virtual_resource
                : ''
            })
          }

          // Join holders with NFT data
          const badgeHolders: BadgeHolder[] = []
          for (const [holderAddress, holder] of holderNftMap) {
            for (const localId of holder.localIds) {
              const nftData = nftDataMap.get(localId)
              badgeHolders.push({
                holderAddress,
                localId,
                name: nftData?.name ?? '',
                mfaVirtualResource: nftData?.mfaVirtualResource ?? '',
                keyType: keyTypeFromResource(nftData?.mfaVirtualResource ?? '')
              })
            }
          }

          return {
            teamMemberBadgeAddress: team.badgeAddress,
            threshold,
            signers,
            badgeHolders,
            pendingMembers
          } satisfies TeamOverview
        })

      return { getOverview } as const
    })
  }
) {}
