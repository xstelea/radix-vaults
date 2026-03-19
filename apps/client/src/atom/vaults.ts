import { Atom } from '@effect-atom/atom-react'
import type { VaultAddress } from '@radix-vaults/shared'
import { Data, Effect, Layer, Option } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { AppApiClient } from '@/lib/apiClient'
import { disconnectOnUnauthorized } from '@/lib/disconnectOnUnauthorized'
import { RadixDappToolkit } from '@/lib/radixDappToolkit'
import { VaultService } from '@/services/vault'
import { withToast } from '@/atom/withToast'

const runtime = makeAtomRuntime(
  Layer.merge(
    VaultService.Default,
    RadixDappToolkit.Live.pipe(Layer.provide(AppApiClient.Default))
  )
)

export const vaultsListAtom = Atom.family((teamId: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const svc = yield* VaultService
        return yield* svc.list(teamId)
      })
    )
    .pipe(Atom.withLabel(`vaultsListAtom(${teamId})`), Atom.keepAlive)
)

export const createVault = runtime.fn(
  (args: { teamId: string; name: string; threshold: number }) =>
    Effect.gen(function* () {
      const svc = yield* VaultService
      return yield* svc.createVault(args.teamId, args.name, args.threshold)
    }).pipe(
      disconnectOnUnauthorized,
      withToast({
        whenLoading: 'Creating vault...',
        whenSuccess: 'Vault created successfully',
        whenFailure: () => Option.none()
      })
    )
)

export const importVault = runtime.fn(
  (args: { teamId: string; accountAddress: VaultAddress; name: string }) =>
    Effect.gen(function* () {
      const svc = yield* VaultService
      return yield* svc.importVault(args.teamId, args.accountAddress, args.name)
    }).pipe(
      disconnectOnUnauthorized,
      withToast({
        whenLoading: 'Importing vault...',
        whenSuccess: 'Vault imported successfully',
        whenFailure: () => Option.none()
      })
    )
)

interface VaultReadKey {
  readonly teamId: string
  readonly vaultAddress: VaultAddress
}
const VaultReadKey = Data.case<VaultReadKey>()

export const vaultReadAtom = Atom.family(
  ({ teamId, vaultAddress }: VaultReadKey) =>
    runtime
      .atom(
        Effect.gen(function* () {
          const svc = yield* VaultService
          return yield* Effect.all({
            detail: svc.getDetail(teamId, vaultAddress),
            signers: svc.getSigners(teamId, vaultAddress),
            balanceXrd: svc.getVaultBalanceXrd(teamId, vaultAddress)
          })
        })
      )
      .pipe(
        Atom.withLabel(`vaultReadAtom(${teamId}:${vaultAddress})`),
        Atom.keepAlive
      )
)
export { VaultReadKey }
