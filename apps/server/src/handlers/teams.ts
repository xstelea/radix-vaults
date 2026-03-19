import {
  AuthConfig,
  CreateTeamFailedError,
  type CreateTeamResponse,
  type TeamListItem
} from '@radix-vaults/shared'
import { Effect } from 'effect'
import { buildCreateTeamBadgeManifest } from '../gateway/manifests'
import { TransactionSubmitter } from '../gateway/transactionSubmitter'
import { TeamRepo } from './teamRepo'

export class TeamsHandler extends Effect.Service<TeamsHandler>()(
  '@radix-vaults/server/handlers/TeamsHandler',
  {
    effect: Effect.gen(function* () {
      const teamRepo = yield* TeamRepo
      const transactionSubmitter = yield* TransactionSubmitter
      const authConfig = yield* AuthConfig

      const createTeam = (
        name: string,
        virtualBadge: string,
        memberName: string,
        creatorAccountAddress: string
      ): Effect.Effect<CreateTeamResponse, CreateTeamFailedError> =>
        Effect.gen(function* () {
          const teamId = crypto.randomUUID()

          const manifest = yield* Effect.promise(() =>
            buildCreateTeamBadgeManifest({
              feePayerAddress: transactionSubmitter.feePayerAddress,
              creatorVirtualBadge: virtualBadge,
              creatorAccount: creatorAccountAddress,
              memberName,
              teamId,
              networkId: authConfig.networkId
            })
          )

          const { entities } =
            yield* transactionSubmitter.submitFeePayerOnly(manifest)

          const badgeAddress = entities.find((addr) =>
            addr.startsWith('resource_')
          )

          if (!badgeAddress) {
            return yield* Effect.fail(
              new CreateTeamFailedError({
                message: `No resource address found in transaction receipt. Entities: ${entities.join(', ')}`
              })
            )
          }

          yield* teamRepo.insert(teamId, name, badgeAddress)
          yield* teamRepo.addMember(teamId, creatorAccountAddress, true)

          yield* Effect.logInfo('Team created').pipe(
            Effect.annotateLogs({ teamId, name, badgeAddress })
          )

          return {
            teamId,
            name,
            badgeAddress
          } satisfies CreateTeamResponse
        }).pipe(
          Effect.catchTags({
            TransactionSubmitError: (e) =>
              new CreateTeamFailedError({ message: e.message })
          })
        )

      const listByMember = (
        accountAddress: string
      ): Effect.Effect<TeamListItem[]> =>
        teamRepo.listByMember(accountAddress).pipe(
          Effect.map((rows) =>
            rows.map((r) => ({
              teamId: r.id,
              name: r.name,
              badgeAddress: r.badgeAddress
            }))
          )
        )

      return { createTeam, listByMember } as const
    })
  }
) {}
