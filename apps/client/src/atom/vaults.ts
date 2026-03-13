import { Atom } from '@effect-atom/atom-react'
import type { VaultAddress } from '@radix-vaults/shared'
import { Effect, Layer, Option } from 'effect'
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

export const vaultsListAtom = runtime
  .atom(
    Effect.gen(function* () {
      const svc = yield* VaultService
      return yield* svc.list()
    })
  )
  .pipe(Atom.withLabel('vaultsListAtom'), Atom.keepAlive)

export const createVault = runtime.fn(
  (args: { name: string; threshold: number }) =>
    Effect.gen(function* () {
      const svc = yield* VaultService
      return yield* svc.createVault(args.name, args.threshold)
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
  (args: { accountAddress: VaultAddress; name: string }) =>
    Effect.gen(function* () {
      const svc = yield* VaultService
      return yield* svc.importVault(args.accountAddress, args.name)
    }).pipe(
      disconnectOnUnauthorized,
      withToast({
        whenLoading: 'Importing vault...',
        whenSuccess: 'Vault imported successfully',
        whenFailure: () => Option.none()
      })
    )
)

export const vaultReadAtom = Atom.family((vaultAddress: VaultAddress) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const svc = yield* VaultService
        return yield* Effect.all({
          detail: svc.getDetail(vaultAddress),
          signers: svc.getSigners(vaultAddress),
          balanceXrd: svc.getVaultBalanceXrd(vaultAddress)
        })
      })
    )
    .pipe(Atom.withLabel(`vaultReadAtom(${vaultAddress})`), Atom.keepAlive)
)
