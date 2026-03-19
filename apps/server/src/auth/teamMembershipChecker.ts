import { GetEntityDetailsVaultAggregated } from '@radix-effects/gateway'
import { NotATeamMemberError, type TeamId } from '@radix-vaults/shared'
import type { AccountAddress } from '@radix-effects/shared'
import { Effect } from 'effect'
import { TeamRepo } from '../handlers/teamRepo'

export class TeamMembershipChecker extends Effect.Service<TeamMembershipChecker>()(
  '@radix-vaults/server/auth/TeamMembershipChecker',
  {
    effect: Effect.gen(function* () {
      const teamRepo = yield* TeamRepo
      const getEntityDetails = yield* GetEntityDetailsVaultAggregated

      const check = (
        teamId: TeamId,
        accountAddress: AccountAddress
      ): Effect.Effect<void, NotATeamMemberError> =>
        Effect.gen(function* () {
          // 1. DB lookup: confirmed member?
          const team = yield* teamRepo.getById(teamId).pipe(
            Effect.catchTag('TeamNotFoundError', () =>
              Effect.fail(
                new NotATeamMemberError({
                  message: `Team ${teamId} not found`
                })
              )
            )
          )

          const members = yield* teamRepo.getConfirmedMembers(teamId).pipe(
            Effect.catchAll(() =>
              Effect.fail(
                new NotATeamMemberError({
                  message: 'Failed to check team membership'
                })
              )
            )
          )

          const isMember = members.some(
            (m) => m.accountAddress === accountAddress
          )
          if (!isMember) {
            return yield* new NotATeamMemberError({
              message: `Account ${accountAddress} is not a confirmed member of team ${teamId}`
            })
          }

          // 2. On-chain badge ownership check
          const details = yield* getEntityDetails(
            [accountAddress],
            undefined,
            undefined
          ).pipe(
            Effect.catchAll(() =>
              Effect.fail(
                new NotATeamMemberError({
                  message: 'Failed to verify on-chain badge ownership'
                })
              )
            )
          )

          const entity = details[0]
          if (!entity) {
            return yield* new NotATeamMemberError({
              message: `Account ${accountAddress} not found on ledger`
            })
          }

          const nfResources = entity.non_fungible_resources?.items ?? []
          const hasBadge = nfResources.some(
            (r: { resource_address?: string }) =>
              r.resource_address === team.badgeAddress
          )

          if (!hasBadge) {
            return yield* new NotATeamMemberError({
              message: `Account ${accountAddress} does not hold the team badge`
            })
          }
        })

      return { check } as const
    })
  }
) {}
