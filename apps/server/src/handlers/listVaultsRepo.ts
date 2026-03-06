import { proposals, vaults } from '@radix-vaults/database'
import {
  VaultAddress,
  type VaultAddress as VaultAddressType,
  VaultsConfig,
  type VaultDetail,
  type VaultListItem
} from '@radix-vaults/shared'
import { Data, Effect } from 'effect'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { ORM } from '../db/orm'

const pendingStatuses = ['created', 'signing', 'ready'] as const

export class VaultNotFoundError extends Data.TaggedError('VaultNotFoundError')<{
  vaultAddress: VaultAddressType
}> {}

export class ListVaultsRepo extends Effect.Service<ListVaultsRepo>()(
  '@radix-vaults/server/handlers/ListVaultsRepo',
  {
    effect: Effect.gen(function* () {
      const db = yield* ORM
      const config = yield* VaultsConfig

      const selectVaultBase = () =>
        db
          .select({
            accountAddress: vaults.accountAddress,
            name: vaults.name,
            pendingProposalCount: sql<number>`count(${proposals.id})::int`
          })
          .from(vaults)
          .leftJoin(
            proposals,
            and(
              eq(proposals.vaultAddress, vaults.accountAddress),
              inArray(proposals.status, pendingStatuses)
            )
          )

      const list = () =>
        selectVaultBase()
          .where(ne(vaults.accountAddress, config.teamAccountAddress))
          .groupBy(vaults.accountAddress, vaults.name, vaults.createdAt)
          .orderBy(vaults.createdAt)
          .pipe(
            Effect.map((rows) =>
              rows.map((row) => ({
                ...row,
                accountAddress: VaultAddress.make(row.accountAddress)
              }))
            ),
            Effect.map((rows) => rows satisfies ReadonlyArray<VaultListItem>),
            Effect.catchTags({
              SqlError: Effect.die
            })
          )

      const getDetailBase = (vaultAddress: VaultAddressType) =>
        selectVaultBase()
          .where(eq(vaults.accountAddress, vaultAddress))
          .groupBy(vaults.accountAddress, vaults.name)
          .limit(1)
          .pipe(
            Effect.flatMap((rows) => {
              const vault = rows[0]
              if (!vault) {
                return Effect.fail(new VaultNotFoundError({ vaultAddress }))
              }
              return Effect.succeed({
                ...vault,
                accountAddress: VaultAddress.make(vault.accountAddress)
              } satisfies Pick<
                VaultDetail,
                'accountAddress' | 'name' | 'pendingProposalCount'
              >)
            }),
            Effect.catchTags({
              SqlError: Effect.die
            })
          )

      const ensureExists = (vaultAddress: VaultAddressType) =>
        db
          .select({ accountAddress: vaults.accountAddress })
          .from(vaults)
          .where(eq(vaults.accountAddress, vaultAddress))
          .limit(1)
          .pipe(
            Effect.flatMap((rows) =>
              rows.length > 0
                ? Effect.void
                : Effect.fail(new VaultNotFoundError({ vaultAddress }))
            ),
            Effect.catchTags({
              SqlError: Effect.die
            })
          )

      return {
        list,
        getDetailBase,
        ensureExists
      } as const
    })
  }
) {}
