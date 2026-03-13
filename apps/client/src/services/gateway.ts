import {
  GatewayApiClient,
  GetEntityDetailsVaultAggregated,
  PreviewTransaction
} from '@radix-effects/gateway'
import type { VaultAddress, VaultSigners } from '@radix-vaults/shared'
import { parseOwnerAccessRule } from '@radix-vaults/shared'
import { ConfigProvider, Effect, Layer } from 'effect'

const NETWORK_ID = Number(import.meta.env.VITE_NETWORK_ID ?? '2')

const ED25519_RESOURCE_SUFFIX = 'ed25sg'

const keyTypeFromResource = (
  resourceAddress: string
): 'ed25519' | 'secp256k1' =>
  resourceAddress.includes(ED25519_RESOURCE_SUFFIX) ? 'ed25519' : 'secp256k1'

const GatewayApiClientLayer = GatewayApiClient.Default.pipe(
  Layer.provide(
    Layer.setConfigProvider(
      ConfigProvider.fromJson({ NETWORK_ID }).pipe(
        ConfigProvider.orElse(() => ConfigProvider.fromEnv())
      )
    )
  )
)

export class GatewayService extends Effect.Service<GatewayService>()(
  '@radix-vaults/client/GatewayService',
  {
    dependencies: [
      GetEntityDetailsVaultAggregated.Default.pipe(
        Layer.provide(GatewayApiClientLayer)
      ),
      PreviewTransaction.Default.pipe(Layer.provide(GatewayApiClientLayer))
    ],
    effect: Effect.gen(function* () {
      const getEntityDetails = yield* GetEntityDetailsVaultAggregated
      const previewFn = yield* PreviewTransaction

      const getVaultSigners = (
        vaultAddress: VaultAddress
      ): Effect.Effect<VaultSigners> =>
        Effect.gen(function* () {
          const details = yield* getEntityDetails(
            [vaultAddress],
            undefined,
            undefined
          ).pipe(Effect.orDie)

          const entity = details[0]
          const componentDetails = entity?.details
          if (
            !componentDetails ||
            componentDetails.type !== 'Component' ||
            !componentDetails.role_assignments
          ) {
            return {
              vaultAddress,
              threshold: 0,
              signers: []
            } satisfies VaultSigners
          }

          const ownerRole = componentDetails.role_assignments.owner
          const parsed = parseOwnerAccessRule(ownerRole)

          if (!parsed) {
            return {
              vaultAddress,
              threshold: 0,
              signers: []
            } satisfies VaultSigners
          }

          const threshold =
            parsed.type === 'CountOf' ? parsed.count : parsed.signers.length

          const signers = parsed.signers.map((s) => ({
            signerPublicKey: s.localId,
            signerKeyType: keyTypeFromResource(s.resourceAddress),
            signerKeyHash: s.localId,
            nonFungibleGlobalId: `${s.resourceAddress}:${s.localId}`
          }))

          return { vaultAddress, threshold, signers } satisfies VaultSigners
        })

      const getVaultBalanceXrd = (
        vaultAddress: VaultAddress
      ): Effect.Effect<string> =>
        Effect.gen(function* () {
          const details = yield* getEntityDetails(
            [vaultAddress],
            undefined,
            undefined
          ).pipe(Effect.orDie)

          const entity = details[0]
          const xrdItem = entity?.fungible_resources?.items.find((item) =>
            item.resource_address.includes('radxrd')
          )

          if (!xrdItem) return '0'

          const total = (xrdItem.vaults?.items ?? []).reduce(
            (sum, v) => sum + Number(v.amount),
            0
          )

          return String(total)
        })

      const previewManifest = (manifest: string) =>
        Effect.gen(function* () {
          const result = yield* previewFn({
            payload: {
              manifest,
              start_epoch_inclusive: 1,
              end_epoch_exclusive: 2,
              nonce: 1,
              signer_public_keys: [],
              flags: {
                assume_all_signature_proofs: true,
                use_free_credit: true,
                skip_epoch_check: true
              },
              opt_ins: {}
            }
          })

          const receipt = result.receipt as Record<string, unknown>

          const logs = (result.logs ?? []).map((l) => ({
            level: l.level,
            message: l.message
          }))

          // Parse resource_changes to determine account interactions.
          // V1 preview returns per-instruction groups: [{ index, resource_changes: [...] }]
          type ResourceChange = {
            resource_address: string
            component_entity: { entity_address: string }
            amount: string
          }
          const groups = result.resource_changes as Array<{
            resource_changes?: ResourceChange[]
          }>
          const changes = groups
            .flatMap((g) => g.resource_changes ?? [])
            .filter((c) =>
              c.component_entity?.entity_address?.startsWith('account_')
            )

          const aggregated = new Map<string, number>()
          for (const c of changes) {
            const key = `${c.component_entity.entity_address}|${c.resource_address}`
            aggregated.set(key, (aggregated.get(key) ?? 0) + Number(c.amount))
          }

          const resourceChanges: Array<{
            accountAddress: string
            resourceAddress: string
            amount: string
          }> = []
          for (const [key, total] of aggregated) {
            if (total === 0) continue
            const separatorIndex = key.indexOf('|')
            const accountAddress = key.slice(0, separatorIndex)
            const resourceAddress = key.slice(separatorIndex + 1)
            resourceChanges.push({
              accountAddress,
              resourceAddress,
              amount: total > 0 ? `+${total}` : String(total)
            })
          }

          return { receipt: receipt ?? null, logs, resourceChanges }
        })

      return { getVaultSigners, getVaultBalanceXrd, previewManifest } as const
    })
  }
) {}
