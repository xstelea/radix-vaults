import { Atom } from '@effect-atom/atom-react'
import { Effect } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { TeamService } from '@/services/team'

const runtime = makeAtomRuntime(TeamService.Default)

export const setSignerSource = (
  publicKey: string,
  keyType: 'ed25519' | 'secp256k1'
) =>
  TeamService.pipe(
    Effect.andThen((svc) => svc.setSignerSource(publicKey, keyType)),
    Effect.provide(TeamService.Default)
  )

export const clearSignerSource = () =>
  TeamService.pipe(
    Effect.andThen((svc) => svc.clearSignerSource()),
    Effect.provide(TeamService.Default)
  )

export const teamOverviewAtom = runtime
  .atom(
    Effect.gen(function* () {
      const svc = yield* TeamService
      return yield* svc.getOverview()
    })
  )
  .pipe(Atom.withLabel('teamOverviewAtom'), Atom.keepAlive)
