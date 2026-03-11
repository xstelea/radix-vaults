import { Atom } from '@effect-atom/atom-react'
import { Effect, Option } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { TeamService } from '@/services/team'
import { withToast } from '@/atom/withToast'

const runtime = makeAtomRuntime(TeamService.Default)

export const setSignerSource = runtime.fn(
  (args: { publicKey: string; keyType: 'ed25519' | 'secp256k1' }) =>
    Effect.gen(function* () {
      const svc = yield* TeamService
      return yield* svc.setSignerSource(args.publicKey, args.keyType)
    }).pipe(
      withToast({
        whenLoading: 'Setting signer source...',
        whenSuccess: 'Signer source set successfully',
        whenFailure: () => Option.none()
      })
    )
)

export const clearSignerSource = runtime.fn(() =>
  Effect.gen(function* () {
    const svc = yield* TeamService
    return yield* svc.clearSignerSource()
  }).pipe(
    withToast({
      whenLoading: 'Clearing signer source...',
      whenSuccess: 'Signer source cleared',
      whenFailure: () => Option.none()
    })
  )
)

export const teamOverviewAtom = runtime
  .atom(
    Effect.gen(function* () {
      const svc = yield* TeamService
      return yield* svc.getOverview()
    })
  )
  .pipe(Atom.withLabel('teamOverviewAtom'), Atom.keepAlive)
