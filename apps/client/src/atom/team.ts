import { Atom } from '@effect-atom/atom-react'
import { Effect } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { TeamService } from '@/services/team'

const runtime = makeAtomRuntime(TeamService.Default)

export const setSignerSource = runtime.fn(
  (args: { publicKey: string; keyType: 'ed25519' | 'secp256k1' }) =>
    Effect.gen(function* () {
      const svc = yield* TeamService
      return yield* svc.setSignerSource(args.publicKey, args.keyType)
    })
)

export const clearSignerSource = runtime.fn(() =>
  Effect.gen(function* () {
    const svc = yield* TeamService
    return yield* svc.clearSignerSource()
  })
)

export const teamOverviewAtom = runtime
  .atom(
    Effect.gen(function* () {
      const svc = yield* TeamService
      return yield* svc.getOverview()
    })
  )
  .pipe(Atom.withLabel('teamOverviewAtom'), Atom.keepAlive)
