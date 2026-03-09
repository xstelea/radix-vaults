import { vaults } from '@radix-vaults/database'
import type { VaultAddress } from '@radix-vaults/shared'
import { Data, Effect } from 'effect'
import { eq } from 'drizzle-orm'
import { ORM } from '../db/orm'

export class VaultAlreadyExistsDbError extends Data.TaggedError(
  'VaultAlreadyExistsDbError'
)<{
  accountAddress: VaultAddress
}> {}

export class ImportVaultRepo extends Effect.Service<ImportVaultRepo>()(
  '@radix-vaults/server/handlers/ImportVaultRepo',
  {
    effect: Effect.gen(function* () {
      const db = yield* ORM

      const insert = (accountAddress: VaultAddress, name: string) =>
        Effect.gen(function* () {
          const existing = yield* db
            .select({ accountAddress: vaults.accountAddress })
            .from(vaults)
            .where(eq(vaults.accountAddress, accountAddress))
            .limit(1)
            .pipe(Effect.catchTags({ SqlError: Effect.die }))

          if (existing.length > 0) {
            return yield* new VaultAlreadyExistsDbError({ accountAddress })
          }

          yield* db
            .insert(vaults)
            .values({ accountAddress, name })
            .pipe(Effect.catchTags({ SqlError: Effect.die }))

          return { accountAddress, name }
        })

      return { insert } as const
    })
  }
) {}
