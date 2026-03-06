import { HexString } from '@radix-vaults/shared'
import { challenges } from '@radix-vaults/database'
import { Data, DateTime, Effect } from 'effect'
import { and, eq, gt, sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { ORM } from '../db/orm'

export class ChallengeExpiredOrUsedError extends Data.TaggedError(
  'ChallengeExpiredOrUsedError'
)<{
  challenge: HexString
}> {}

export class ChallengeStore extends Effect.Service<ChallengeStore>()(
  '@radix-vaults/server/auth/ChallengeStore',
  {
    effect: Effect.gen(function* () {
      const db = yield* ORM

      const create = () =>
        Effect.gen(function* () {
          const challengeHex = HexString.make(randomBytes(32).toString('hex'))
          const expiresAt = (yield* DateTime.now).pipe(
            DateTime.addDuration('5 minutes'),
            DateTime.toDateUtc
          )

          yield* db
            .insert(challenges)
            .values({ challenge: challengeHex, expiresAt })
            .pipe(
              Effect.catchTags({
                SqlError: Effect.die
              })
            )

          return challengeHex
        })

      const consume = (challengeHex: HexString) =>
        db
          .update(challenges)
          .set({ used: true })
          .where(
            and(
              eq(challenges.challenge, challengeHex),
              eq(challenges.used, false),
              gt(challenges.expiresAt, sql`now()`)
            )
          )
          .returning({ id: challenges.id })
          .pipe(
            Effect.flatMap((rows) =>
              rows.length > 0
                ? Effect.void
                : Effect.fail(
                    new ChallengeExpiredOrUsedError({
                      challenge: challengeHex
                    })
                  )
            ),
            Effect.catchTags({
              SqlError: Effect.die
            })
          )

      return { create, consume } as const
    })
  }
) {}
