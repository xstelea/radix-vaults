import { Atom } from '@effect-atom/atom-react'
import { Effect, Layer, Option } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { withToast } from '@/atom/withToast'
import { AppApiClient } from '@/lib/apiClient'
import { disconnectOnUnauthorized } from '@/lib/disconnectOnUnauthorized'
import { RadixDappToolkit } from '@/lib/radixDappToolkit'
import { TeamsService } from '@/services/teams'

const runtime = makeAtomRuntime(
  Layer.merge(
    TeamsService.Default,
    RadixDappToolkit.Live.pipe(Layer.provide(AppApiClient.Default))
  )
)

export const teamsListAtom = runtime
  .atom(
    Effect.gen(function* () {
      const svc = yield* TeamsService
      return yield* svc.list()
    }).pipe(Effect.catchTag('Unauthorized', () => Effect.succeed([])))
  )
  .pipe(Atom.withLabel('teamsListAtom'))

export const createTeam = runtime.fn(
  (args: { name: string; virtualBadge: string; memberName: string }) =>
    Effect.gen(function* () {
      const svc = yield* TeamsService
      return yield* svc.createTeam(
        args.name,
        args.virtualBadge,
        args.memberName
      )
    }).pipe(
      disconnectOnUnauthorized,
      withToast({
        whenLoading: 'Creating team...',
        whenSuccess: 'Team created successfully',
        whenFailure: () => Option.none()
      })
    )
)
