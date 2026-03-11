import { Atom } from '@effect-atom/atom-react'
import { Effect } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { TeamService } from '@/services/team'

const runtime = makeAtomRuntime(TeamService.Default)

export const teamOverviewAtom = runtime
  .atom(
    Effect.gen(function* () {
      const svc = yield* TeamService
      return yield* svc.getOverview()
    })
  )
  .pipe(Atom.withLabel('teamOverviewAtom'), Atom.keepAlive)

export const teamMembersAtom = runtime
  .atom(
    Effect.gen(function* () {
      const svc = yield* TeamService
      return yield* svc.getMembers()
    })
  )
  .pipe(Atom.withLabel('teamMembersAtom'), Atom.keepAlive)
