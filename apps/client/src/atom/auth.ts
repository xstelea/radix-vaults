import { Atom } from '@effect-atom/atom-react'
import { Effect } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { AuthService } from '@/services/auth'

const runtime = makeAtomRuntime(AuthService.Default)

export const sessionAtom = runtime
  .atom(
    Effect.gen(function* () {
      const auth = yield* AuthService
      return yield* auth.getSession()
    })
  )
  .pipe(Atom.withLabel('sessionAtom'), Atom.keepAlive)
