import { Atom } from '@effect-atom/atom-react'
import type { VaultAddress } from '@radix-vaults/shared'
import { Effect } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { ProposalService } from '@/services/proposal'

const runtime = makeAtomRuntime(ProposalService.Default)

export const proposalListAtom = Atom.family((vaultAddress: VaultAddress) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const svc = yield* ProposalService
        return yield* svc.list(vaultAddress)
      })
    )
    .pipe(Atom.withLabel(`proposalListAtom(${vaultAddress})`), Atom.keepAlive)
)

export const proposalDetailAtom = Atom.family(
  ({
    vaultAddress,
    proposalId
  }: {
    vaultAddress: VaultAddress
    proposalId: number
  }) =>
    runtime
      .atom(
        Effect.gen(function* () {
          const svc = yield* ProposalService
          return yield* svc.getDetail(vaultAddress, proposalId)
        })
      )
      .pipe(
        Atom.withLabel(`proposalDetailAtom(${vaultAddress}:${proposalId})`),
        Atom.keepAlive
      )
)
