import { Atom } from '@effect-atom/atom-react'
import type { VaultAddress } from '@radix-vaults/shared'
import { Effect } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { VaultService } from '@/services/vault'

const runtime = makeAtomRuntime(VaultService.Default)

export const vaultsListAtom = runtime
  .atom(
    Effect.gen(function* () {
      const svc = yield* VaultService
      return yield* svc.list()
    })
  )
  .pipe(Atom.withLabel('vaultsListAtom'), Atom.keepAlive)

export const createVault = (name: string, threshold: number) =>
  VaultService.pipe(
    Effect.andThen((svc) => svc.createVault(name, threshold)),
    Effect.provide(VaultService.Default)
  )

export const importVault = (accountAddress: VaultAddress, name: string) =>
  VaultService.pipe(
    Effect.andThen((svc) => svc.importVault(accountAddress, name)),
    Effect.provide(VaultService.Default)
  )

export const vaultReadAtom = Atom.family((vaultAddress: VaultAddress) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const svc = yield* VaultService
        return yield* Effect.all({
          detail: svc.getDetail(vaultAddress),
          signers: svc.getSigners(vaultAddress)
        })
      })
    )
    .pipe(Atom.withLabel(`vaultReadAtom(${vaultAddress})`), Atom.keepAlive)
)
