import {
  useAtom,
  useAtomRefresh,
  useAtomValue,
  Result
} from '@effect-atom/atom-react'
import { VaultAddress } from '@radix-vaults/shared'
import {
  createFileRoute,
  useNavigate,
  Link,
  ClientOnly
} from '@tanstack/react-router'
import { Cause, Exit, Option } from 'effect'
import { useState } from 'react'
import { useTeamName } from '@/hooks/useNames'
import {
  createChangeThresholdProposal,
  teamProposalListAtom
} from '@/atom/teamProposals'
import { vaultsListAtom } from '@/atom/vaults'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

type SearchParams = {
  vault?: string
}

export const Route = createFileRoute('/teams/$teamId/team/change-threshold')({
  component: ChangeThresholdPage,
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    const params: SearchParams = {}
    if (typeof search.vault === 'string') params.vault = search.vault
    return params
  }
})

function ChangeThresholdPage() {
  const { teamId } = Route.useParams()
  const teamName = useTeamName(teamId)
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
          to="/teams/$teamId/team"
          params={{ teamId }}
          className="hover:text-foreground"
        >
          Members
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground font-medium">Change Threshold</span>
      </nav>

      <ClientOnly fallback={<Skeleton className="h-64 w-full" />}>
        <ChangeThresholdForm teamId={teamId} />
      </ClientOnly>
    </main>
  )
}

function ChangeThresholdForm({ teamId }: { teamId: string }) {
  const { vault: prefilledVault } = Route.useSearch()
  const navigate = useNavigate()
  const refreshProposals = useAtomRefresh(teamProposalListAtom(teamId))
  const [, dispatch] = useAtom(createChangeThresholdProposal, {
    mode: 'promiseExit'
  })

  const vaultsResult = useAtomValue(vaultsListAtom(teamId))

  const [vaultAddress, setVaultAddress] = useState(prefilledVault ?? '')
  const [threshold, setThreshold] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const vaults = Result.builder(vaultsResult)
    .onInitialOrWaiting(() => null)
    .onFailure(() => null)
    .onSuccess((v) => v)
    .render()

  if (!vaults) {
    return <Skeleton className="h-64 w-full" />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const exit = await dispatch({
      teamId,
      input: {
        vaultAddress: VaultAddress.make(vaultAddress.trim()),
        threshold: Number(threshold)
      }
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
        navigate({
          to: '/teams/$teamId/team/proposals/$proposalId',
          params: { teamId, proposalId: String(result.id) }
        })
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Change Vault Threshold</CardTitle>
        <CardDescription>
          Create a proposal to change the signing threshold for a vault (same
          signers, new threshold).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="vaultAddress" className="text-sm font-medium">
              Vault
            </label>
            <select
              id="vaultAddress"
              required
              value={vaultAddress}
              onChange={(e) => setVaultAddress(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Select a vault...</option>
              {vaults.map((v) => (
                <option key={v.accountAddress} value={v.accountAddress}>
                  {v.name} (account_...{v.accountAddress.slice(-6)})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="threshold" className="text-sm font-medium">
              New Threshold
            </label>
            <input
              id="threshold"
              type="number"
              required
              min={1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
            />
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
              {submitting ? 'Creating...' : 'Create Threshold Proposal'}
            </Button>
            <Link to="/teams/$teamId/team" params={{ teamId }}>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
