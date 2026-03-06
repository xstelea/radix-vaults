import { challenges } from '@radix-vaults/database'
import { Data, Effect } from 'effect'
import { and, eq, gt, sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { ORM } from '../db/orm'

const CHALLENGE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export class ChallengeExpiredOrUsedError extends Data.TaggedError(
  'ChallengeExpiredOrUsedError'
)<{
  challenge: string
}> {}

export class ChallengeStore extends Effect.Service<ChallengeStore>()(
  '@radix-vaults/server/auth/ChallengeStore',
  {
    effect: Effect.gen(function* () {
      const db = yield* ORM

      const create = () =>
        Effect.gen(function* () {
          const challengeHex = randomBytes(32).toString('hex')
          const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)

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

      const consume = (challengeHex: string) =>
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
