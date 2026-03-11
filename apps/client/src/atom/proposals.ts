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

export const createProposal = runtime.fn(
  (args: {
    vaultAddress: VaultAddress
    manifest: string
    maxProposerTimestamp: string
  }) =>
    Effect.gen(function* () {
      const svc = yield* ProposalService
      return yield* svc.create(
        args.vaultAddress,
        args.manifest,
        args.maxProposerTimestamp
      )
    })
)

export const signProposal = runtime.fn(
  (args: { vaultAddress: VaultAddress; proposalId: number }) =>
    Effect.gen(function* () {
      const svc = yield* ProposalService
      return yield* svc.sign(args.vaultAddress, args.proposalId)
    })
)

export const submitProposal = runtime.fn(
  (args: { vaultAddress: VaultAddress; proposalId: number }) =>
    Effect.gen(function* () {
      const svc = yield* ProposalService
      return yield* svc.submit(args.vaultAddress, args.proposalId)
    })
)

export const refreshProposalStatus = runtime.fn(
  (args: { vaultAddress: VaultAddress; proposalId: number }) =>
    Effect.gen(function* () {
      const svc = yield* ProposalService
      return yield* svc.refreshStatus(args.vaultAddress, args.proposalId)
    })
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
