import { memberSignerSources } from '@radix-vaults/database'
import type { AccountAddress } from '@radix-vaults/shared'
import { Effect } from 'effect'
import { eq } from 'drizzle-orm'
import { ORM } from '../db/orm'

export class SignerSourceRepo extends Effect.Service<SignerSourceRepo>()(
  '@radix-vaults/server/handlers/SignerSourceRepo',
  {
    effect: Effect.gen(function* () {
      const db = yield* ORM

      const list = () =>
        db
          .select({
            accountAddress: memberSignerSources.accountAddress,
            publicKey: memberSignerSources.publicKey,
            keyType: memberSignerSources.keyType
          })
          .from(memberSignerSources)
          .pipe(Effect.catchTags({ SqlError: Effect.die }))

      const set = (
        accountAddress: AccountAddress,
        publicKey: string,
        keyType: 'ed25519' | 'secp256k1'
      ) =>
        db
          .insert(memberSignerSources)
          .values({ accountAddress, publicKey, keyType })
          .onConflictDoUpdate({
            target: memberSignerSources.accountAddress,
            set: { publicKey, keyType }
          })
          .pipe(
            Effect.map(() => ({ accountAddress, publicKey, keyType })),
            Effect.catchTags({ SqlError: Effect.die })
          )

      const clear = (accountAddress: AccountAddress) =>
        db
          .delete(memberSignerSources)
          .where(eq(memberSignerSources.accountAddress, accountAddress))
          .pipe(Effect.catchTags({ SqlError: Effect.die }))

      return { list, set, clear } as const
    })
  }
) {}
