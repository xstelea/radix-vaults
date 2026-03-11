import { useAtom, useAtomRefresh } from '@effect-atom/atom-react'
import { VaultAddress } from '@radix-vaults/shared'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { Cause, Exit, Option } from 'effect'
import { useState } from 'react'
import { createProposal, proposalListAtom } from '@/atom/proposals'
import { vaultReadAtom } from '@/atom/vaults'
import { Button } from '@/components/ui/button'
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
          to: '/vaults/$vaultId/proposals/$proposalId',
          params: { vaultId, proposalId: String(result.id) }
        })
      }
    })
  }

  return (
    <main className="max-w-5xl space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <Link
          to="/vaults/$vaultId"
          params={{ vaultId }}
          className="hover:text-foreground"
        >
          Vault
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
                className="w-full rounded-lg border border-input bg-white px-3 py-2 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
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
                className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Number of hours from now until this proposal expires.
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
