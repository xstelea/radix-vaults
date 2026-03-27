import { useAtom, useAtomRefresh } from '@effect-atom/atom-react'
import { VaultAddress } from '@radix-vaults/shared'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useTeamName, useVaultName } from '@/hooks/useNames'
import { Cause, Exit, Option } from 'effect'
import { useState } from 'react'
import {
  createProposal,
  ProposalListKey,
  proposalListAtom
} from '@/atom/proposals'
import { VaultReadKey, vaultReadAtom } from '@/atom/vaults'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

export const Route = createFileRoute(
  '/teams/$teamId/vaults/$vaultId/proposals/new'
)({
  component: NewProposalPage
})

function NewProposalPage() {
  const { teamId, vaultId } = Route.useParams()
  const navigate = useNavigate()
  const teamName = useTeamName(teamId)
  const vaultName = useVaultName(teamId, vaultId)
  const vaultAddress = VaultAddress.make(vaultId)
  const refreshProposals = useAtomRefresh(
    proposalListAtom(ProposalListKey({ teamId, vaultAddress }))
  )
  const refreshVault = useAtomRefresh(
    vaultReadAtom(VaultReadKey({ teamId, vaultAddress }))
  )
  const [, dispatch] = useAtom(createProposal, { mode: 'promiseExit' })

  const [manifest, setManifest] = useState('')
  const [expiresInHours, setExpiresInHours] = useState('24')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const hours = Number(expiresInHours)
    const deadline = new Date(Date.now() + hours * 60 * 60 * 1000)
    const maxProposerTimestamp = deadline.toISOString().slice(0, 19)

    const exit = await dispatch({
      teamId,
      vaultAddress,
      manifest: manifest.trim(),
      maxProposerTimestamp
    })

    setSubmitting(false)

    Exit.match(exit, {
      onFailure: (cause) => {
        const failure = Cause.failureOption(cause)
        if (
          Option.isSome(failure) &&
          'message' in failure.value &&
          typeof failure.value.message === 'string'
        ) {
          setError(failure.value.message)
        } else {
          setError('An unexpected error occurred. Please try again.')
        }
      },
      onSuccess: (result) => {
        refreshProposals()
        refreshVault()
        navigate({
          to: '/teams/$teamId/vaults/$vaultId/proposals/$proposalId',
          params: { teamId, vaultId, proposalId: String(result.id) }
        })
      }
    })
  }

  return (
    <main className="max-w-5xl space-y-6">
      <nav className="text-sm text-muted-foreground sm:min-h-10 flex items-center flex-wrap">
        <Link to="/" className="hover:text-foreground">
          My Teams
        </Link>
        <span className="mx-2">/</span>
        <Link
          to="/teams/$teamId"
          params={{ teamId }}
          className="hover:text-foreground"
        >
          {teamName}
        </Link>
        <span className="mx-2">/</span>
        <Link
          to="/teams/$teamId/vaults"
          params={{ teamId }}
          className="hover:text-foreground"
        >
          Vaults
        </Link>
        <span className="mx-2">/</span>
        <Link
          to="/teams/$teamId/vaults/$vaultId"
          params={{ teamId, vaultId }}
          className="hover:text-foreground"
        >
          {vaultName}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground font-medium">New Proposal</span>
      </nav>

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
              <label htmlFor="manifest" className="text-sm font-medium">
                Transaction Manifest
              </label>
              <textarea
                id="manifest"
                required
                rows={10}
                placeholder={`CALL_METHOD\n  Address("...")\n  "deposit_batch"\n  Expression("ENTIRE_WORKTOP")\n;`}
                value={manifest}
                onChange={(e) => setManifest(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="expiresInHours" className="text-sm font-medium">
                Expires In (hours)
              </label>
              <input
                id="expiresInHours"
                type="number"
                required
                min={1}
                step={1}
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Number of hours from now until this proposal expires.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
              >
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Proposal'}
              </Button>
              <Link
                to="/teams/$teamId/vaults/$vaultId"
                params={{ teamId, vaultId }}
              >
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
