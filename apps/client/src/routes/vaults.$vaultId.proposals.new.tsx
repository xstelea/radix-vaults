import { useAtomRefresh } from '@effect-atom/atom-react'
import { VaultAddress } from '@radix-vaults/shared'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { Effect, Exit } from 'effect'
import { useState } from 'react'
import { toast } from 'sonner'
import { proposalListAtom } from '@/atom/proposals'
import { vaultReadAtom } from '@/atom/vaults'
import { ProposalService } from '@/services/proposal'
import { AppApiClient } from '@/lib/apiClient'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

export const Route = createFileRoute('/vaults/$vaultId/proposals/new')({
  component: NewProposalPage
})

function NewProposalPage() {
  const { vaultId } = Route.useParams()
  const navigate = useNavigate()
  const vaultAddress = VaultAddress.make(vaultId)
  const refreshProposals = useAtomRefresh(proposalListAtom(vaultAddress))
  const refreshVault = useAtomRefresh(vaultReadAtom(vaultAddress))

  const [manifest, setManifest] = useState('')
  const [maxProposerTimestamp, setMaxProposerTimestamp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const program = Effect.gen(function* () {
      const svc = yield* ProposalService
      return yield* svc.create(
        vaultAddress,
        manifest.trim(),
        maxProposerTimestamp.trim()
      )
    }).pipe(
      Effect.provide(ProposalService.Default),
      Effect.provide(AppApiClient.Default)
    )

    const exit = await Effect.runPromiseExit(program)

    setSubmitting(false)

    Exit.match(exit, {
      onFailure: (cause) => {
        const msg = String(cause)
        if (msg.includes('ProposalPreviewFailedError')) {
          setError(
            'Transaction manifest failed compile/preview validation. Check that the manifest is syntactically valid.'
          )
        } else if (msg.includes('VaultNotFoundError')) {
          setError('Vault not found.')
        } else {
          setError(`Failed to create proposal: ${msg}`)
        }
      },
      onSuccess: (result) => {
        toast.success(`Proposal #${result.id} created`)
        refreshProposals()
        refreshVault()
        navigate({
          to: '/vaults/$vaultId/proposals/$proposalId',
          params: { vaultId, proposalId: String(result.id) }
        })
      }
    })
  }

  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <Link
        to="/vaults/$vaultId"
        params={{ vaultId }}
        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
      >
        Back to vault
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">New Proposal</CardTitle>
          <CardDescription>
            Create a transaction proposal for this vault. The manifest will be
            compiled and previewed before storage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="manifest"
                className="text-sm font-medium text-emerald-950"
              >
                Transaction Manifest
              </label>
              <textarea
                id="manifest"
                required
                rows={10}
                placeholder={`CALL_METHOD\n  Address("...")\n  "deposit_batch"\n  Expression("ENTIRE_WORKTOP")\n;`}
                value={manifest}
                onChange={(e) => setManifest(e.target.value)}
                className="w-full rounded-md border border-emerald-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="maxProposerTimestamp"
                className="text-sm font-medium text-emerald-950"
              >
                Max Proposer Timestamp
              </label>
              <input
                id="maxProposerTimestamp"
                type="datetime-local"
                required
                value={maxProposerTimestamp}
                onChange={(e) => setMaxProposerTimestamp(e.target.value)}
                className="w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
              <p className="text-xs text-muted-foreground">
                The latest time at which this proposal can be submitted.
              </p>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Proposal'}
              </Button>
              <Link to="/vaults/$vaultId" params={{ vaultId }}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
