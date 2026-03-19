import { teams, teamMembers } from '@radix-vaults/database'
import { TeamNotFoundError } from '@radix-vaults/shared'
import { Effect } from 'effect'
import { eq } from 'drizzle-orm'
import { ORM } from '../db/orm'

export class TeamRepo extends Effect.Service<TeamRepo>()(
  '@radix-vaults/server/handlers/TeamRepo',
  {
    effect: Effect.gen(function* () {
      const db = yield* ORM

      const insert = (id: string, name: string, badgeAddress: string) =>
        db
          .insert(teams)
          .values({ id, name, badgeAddress })
          .pipe(Effect.catchTags({ SqlError: Effect.die }))

      const addMember = (
        teamId: string,
        accountAddress: string,
        confirmed: boolean
      ) =>
        db
          .insert(teamMembers)
          .values({ teamId, accountAddress, confirmed })
          .pipe(Effect.catchTags({ SqlError: Effect.die }))

      const getById = (teamId: string) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(teams)
            .where(eq(teams.id, teamId))
            .limit(1)
            .pipe(Effect.catchTags({ SqlError: Effect.die }))

          if (rows.length === 0) {
            return yield* new TeamNotFoundError({ teamId })
          }

          return rows[0]!
        })

      const listByMember = (accountAddress: string) =>
        db
          .select({
            id: teams.id,
            name: teams.name,
            badgeAddress: teams.badgeAddress
          })
          .from(teams)
          .innerJoin(teamMembers, eq(teams.id, teamMembers.teamId))
          .where(eq(teamMembers.accountAddress, accountAddress))
          .pipe(Effect.catchTags({ SqlError: Effect.die }))

      return { insert, addMember, getById, listByMember } as const
    })
  }
) {}
