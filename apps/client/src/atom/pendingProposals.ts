import { Atom } from '@effect-atom/atom-react'
import { Effect } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { DashboardService } from '@/services/dashboard'

const runtime = makeAtomRuntime(DashboardService.Default)

export const pendingProposalsAtom = runtime
  .atom(
    Effect.gen(function* () {
      const svc = yield* DashboardService
      return yield* svc.listPending()
    })
  )
  .pipe(Atom.withLabel('pendingProposalsAtom'), Atom.keepAlive)
