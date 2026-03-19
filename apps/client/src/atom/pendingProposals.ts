import { Atom } from '@effect-atom/atom-react'
import { Effect } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { DashboardService } from '@/services/dashboard'

const runtime = makeAtomRuntime(DashboardService.Default)

export const pendingProposalsAtom = Atom.family((teamId: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const svc = yield* DashboardService
        return yield* svc.listPending(teamId)
      })
    )
    .pipe(Atom.withLabel(`pendingProposalsAtom(${teamId})`), Atom.keepAlive)
)
