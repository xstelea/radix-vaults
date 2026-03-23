import { Atom } from '@effect-atom/atom-react'
import { Effect, Layer, Ref, Stream } from 'effect'
import { TreeFormatter } from 'effect/ParseResult'
import { toast } from 'sonner'
import { AppApiClient } from '@/lib/apiClient'
import { RadixDappToolkit } from '@/lib/radixDappToolkit'
import { AuthService } from '@/services/auth'
import { sessionAtom } from '@/atom/auth'
import { teamsListAtom } from '@/atom/teams'

const runtime = Atom.runtime(
  Layer.merge(
    RadixDappToolkit.Live.pipe(Layer.provide(AppApiClient.Default)),
    AuthService.Default
  )
).pipe(Atom.keepAlive)

export const rolaVerificationAtom = runtime
  .atom(
    Effect.fnUntraced(function* (get) {
      const rdtRef = yield* RadixDappToolkit
      const rdt = yield* Ref.get(rdtRef)

      const proofStream = Stream.async<
        { proofs: unknown[] | undefined },
        never
      >((emit) => {
        rdt.walletApi.dataRequestControl(async (walletData) => {
          emit.single(walletData)
        })
      })

      yield* Stream.runForEach(proofStream, (walletData) =>
        Effect.gen(function* () {
          const proofs = walletData.proofs
          if (!proofs || proofs.length === 0) return

          const auth = yield* AuthService
          const handleVerificationFailure = (message: string) =>
            Effect.gen(function* () {
              yield* Effect.sync(() => rdt.disconnect()).pipe(
                Effect.catchAll(() => Effect.void)
              )
              yield* auth.logout().pipe(Effect.catchAll(() => Effect.void))
              yield* Effect.sync(() => {
                toast.error(message)
              })
            })

          yield* auth.verify(proofs[0]).pipe(
            Effect.catchTags({
              InvalidOrExpiredChallengeError: (error) =>
                handleVerificationFailure(error.message),
              RolaVerificationFailedError: (error) =>
                handleVerificationFailure(error.message),
              ParseError: (error) =>
                handleVerificationFailure(TreeFormatter.formatErrorSync(error))
            }),
            Effect.catchAll(() =>
              handleVerificationFailure(
                'Wallet verification failed. You have been logged out.'
              )
            )
          )
          get.refresh(sessionAtom)
          get.refresh(teamsListAtom)
        }).pipe(Effect.catchAll(() => Effect.void))
      )

      return undefined as void
    })
  )
  .pipe(Atom.withLabel('rolaVerificationAtom'))

export const disconnectSyncAtom = runtime
  .atom(
    Effect.fnUntraced(function* (get) {
      const rdtRef = yield* RadixDappToolkit
      const rdt = yield* Ref.get(rdtRef)
      const wasConnectedRef = yield* Ref.make(false)

      const walletDataStream = Stream.async<{ accounts: unknown[] }, never>(
        (emit) => {
          rdt.walletApi.walletData$.subscribe((data) => {
            emit.single(data)
          })
        }
      )

      yield* Stream.runForEach(walletDataStream, (data) =>
        Effect.gen(function* () {
          const wasConnected = yield* Ref.get(wasConnectedRef)
          const isConnected = data.accounts.length > 0

          yield* Ref.set(wasConnectedRef, isConnected)

          if (wasConnected && !isConnected) {
            const auth = yield* AuthService
            yield* auth.logout()
            get.refresh(sessionAtom)
            get.refresh(teamsListAtom)
          }
        }).pipe(Effect.catchAll(() => Effect.void))
      )

      return undefined as void
    })
  )
  .pipe(Atom.withLabel('disconnectSyncAtom'))
