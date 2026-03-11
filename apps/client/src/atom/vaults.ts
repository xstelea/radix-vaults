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

export const createVault = runtime.fn(
  (args: { name: string; threshold: number }) =>
    Effect.gen(function* () {
      const svc = yield* VaultService
      return yield* svc.createVault(args.name, args.threshold)
    })
)

export const importVault = runtime.fn(
  (args: { accountAddress: VaultAddress; name: string }) =>
    Effect.gen(function* () {
      const svc = yield* VaultService
      return yield* svc.importVault(args.accountAddress, args.name)
    })
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
