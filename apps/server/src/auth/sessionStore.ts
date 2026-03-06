import { sessions } from '@radix-vaults/database'
import type { SessionInfo } from '@radix-vaults/shared'
import { Data, Effect } from 'effect'
import { and, eq, gt, sql } from 'drizzle-orm'
import { ORM } from '../db/orm'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export class SessionNotFoundError extends Data.TaggedError(
  'SessionNotFoundError'
)<{
  sessionId: string
}> {}

export class SessionStore extends Effect.Service<SessionStore>()(
  '@radix-vaults/server/auth/SessionStore',
  {
    effect: Effect.gen(function* () {
      const db = yield* ORM

      const create = (accountAddress: string) =>
        db
          .insert(sessions)
          .values({
            accountAddress,
            expiresAt: new Date(Date.now() + SESSION_TTL_MS)
          })
          .returning({ id: sessions.id, expiresAt: sessions.expiresAt })
          .pipe(
            Effect.map((rows) => rows[0]!),
            Effect.catchTags({
              SqlError: Effect.die
            })
          )

      const validate = (sessionId: string) =>
        db
          .select({
            id: sessions.id,
            accountAddress: sessions.accountAddress,
            expiresAt: sessions.expiresAt
          })
          .from(sessions)
          .where(
            and(eq(sessions.id, sessionId), gt(sessions.expiresAt, sql`now()`))
          )
          .limit(1)
          .pipe(
            Effect.flatMap((rows) => {
              const session = rows[0]
              if (!session) {
                return Effect.fail(new SessionNotFoundError({ sessionId }))
              }
              return Effect.succeed({
                accountAddress: session.accountAddress,
                expiresAt: session.expiresAt.toISOString()
              } satisfies SessionInfo)
            }),
            Effect.catchTags({
              SqlError: Effect.die
            })
          )

      const destroy = (sessionId: string) =>
        db
          .delete(sessions)
          .where(eq(sessions.id, sessionId))
          .pipe(
            Effect.asVoid,
            Effect.catchTags({
              SqlError: Effect.die
            })
          )

      return { create, validate, destroy } as const
    })
  }
) {}
