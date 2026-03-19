import { proposals, vaults } from '@radix-vaults/database'
import {
  VaultAddress,
  VaultNotFoundError,
  type VaultAddress as VaultAddressType,
  type VaultDetail,
  type VaultListItem
} from '@radix-vaults/shared'
import { Effect } from 'effect'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { ORM } from '../db/orm'

const pendingStatuses = ['created', 'signing', 'ready'] as const

export class ListVaultsRepo extends Effect.Service<ListVaultsRepo>()(
  '@radix-vaults/server/handlers/ListVaultsRepo',
  {
    effect: Effect.gen(function* () {
      const db = yield* ORM

      const selectVaultBase = (teamId: string) =>
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
              eq(proposals.entityAddress, vaults.accountAddress),
              eq(proposals.teamId, teamId),
              eq(proposals.type, 'vault'),
              inArray(proposals.status, pendingStatuses)
            )
          )

      const list = (teamId: string) =>
        selectVaultBase(teamId)
          .where(eq(vaults.teamId, teamId))
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

      const getDetailBase = (teamId: string, vaultAddress: VaultAddressType) =>
        selectVaultBase(teamId)
          .where(
            and(
              eq(vaults.teamId, teamId),
              eq(vaults.accountAddress, vaultAddress)
            )
          )
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

      const ensureExists = (teamId: string, vaultAddress: VaultAddressType) =>
        db
          .select({ accountAddress: vaults.accountAddress })
          .from(vaults)
          .where(
            and(
              eq(vaults.teamId, teamId),
              eq(vaults.accountAddress, vaultAddress)
            )
          )
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
