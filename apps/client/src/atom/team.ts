import { Atom } from '@effect-atom/atom-react'
import { Effect } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { TeamService } from '@/services/team'

const runtime = makeAtomRuntime(TeamService.Default)

export const teamOverviewAtom = Atom.family((teamId: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const svc = yield* TeamService
        return yield* svc.getOverview(teamId)
      })
    )
    .pipe(Atom.withLabel(`teamOverviewAtom(${teamId})`))
)
