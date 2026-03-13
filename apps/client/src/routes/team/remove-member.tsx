import {
  useAtom,
  useAtomRefresh,
  useAtomValue,
  Result
} from '@effect-atom/atom-react'
import {
  createFileRoute,
  useNavigate,
  Link,
  ClientOnly
} from '@tanstack/react-router'
import { Cause, Exit, Option } from 'effect'
import { useState } from 'react'
import { teamOverviewAtom } from '@/atom/team'
import {
  createRemoveMemberProposal,
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
  address?: string
}

export const Route = createFileRoute('/team/remove-member')({
  component: RemoveMemberPage,
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    const params: SearchParams = {}
    if (typeof search.address === 'string') params.address = search.address
    return params
  }
})

function RemoveMemberPage() {
  return (
    <main className="max-w-5xl space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <Link to="/team" className="hover:text-foreground">
          Team
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground font-medium">Remove Member</span>
      </nav>

      <ClientOnly fallback={<Skeleton className="h-96 w-full" />}>
        <RemoveMemberForm />
      </ClientOnly>
    </main>
  )
}

function RemoveMemberForm() {
  const { address } = Route.useSearch()
  const navigate = useNavigate()
  const refreshTeam = useAtomRefresh(teamOverviewAtom)
  const refreshProposals = useAtomRefresh(teamProposalListAtom)
  const [, dispatch] = useAtom(createRemoveMemberProposal, {
    mode: 'promiseExit'
  })

  const teamResult = useAtomValue(teamOverviewAtom)
  const vaultsResult = useAtomValue(vaultsListAtom)

  const [memberAddress, setMemberAddress] = useState(address ?? '')
  const [virtualBadge, setVirtualBadge] = useState('')
  const [badgeThreshold, setBadgeThreshold] = useState('')
  const [vaultThresholds, setVaultThresholds] = useState<
    Record<string, string>
  >({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const team = Result.builder(teamResult)
    .onInitialOrWaiting(() => null)
    .onFailure(() => null)
    .onSuccess((t) => t)
    .render()

  const vaults = Result.builder(vaultsResult)
    .onInitialOrWaiting(() => null)
    .onFailure(() => null)
    .onSuccess((v) => v)
    .render()

  if (!team || !vaults) {
    return <Skeleton className="h-96 w-full" />
  }

  const newSignerCount = Math.max(team.signers.length - 1, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const exit = await dispatch({
      input: {
        memberAddress: memberAddress.trim(),
        virtualBadge: virtualBadge.trim(),
        badgeThreshold:
          Number(badgeThreshold) || Math.min(team.threshold, newSignerCount),
        vaultThresholds: vaults.map((v) => ({
          vaultAddress: v.accountAddress,
          threshold: Number(vaultThresholds[v.accountAddress]) || 1
        }))
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
        refreshTeam()
        refreshProposals()
        navigate({
          to: '/team/proposals/$proposalId',
          params: { proposalId: String(result.id) }
        })
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Remove Team Member</CardTitle>
        <CardDescription>
          Create a proposal to recall and burn a badge, removing a signer from
          the team and all vaults.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="memberAddress" className="text-sm font-medium">
              Member Account Address
            </label>
            <input
              id="memberAddress"
              type="text"
              required
              placeholder="account_tdx_2_1..."
              value={memberAddress}
              onChange={(e) => setMemberAddress(e.target.value)}
              className="w-full rounded-lg border border-input bg-white px-3 py-2 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="virtualBadge" className="text-sm font-medium">
              Signer to Remove
            </label>
            <select
              id="virtualBadge"
              required
              value={virtualBadge}
              onChange={(e) => setVirtualBadge(e.target.value)}
              className="w-full rounded-lg border border-input bg-white px-3 py-2 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="">Select a signer...</option>
              {team.signers.map((signer) => (
                <option
                  key={signer.nonFungibleGlobalId}
                  value={signer.nonFungibleGlobalId}
                >
                  {signer.signerKeyType}: {signer.signerKeyHash}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="badgeThreshold" className="text-sm font-medium">
              Badge Resource Threshold
            </label>
            <input
              id="badgeThreshold"
              type="number"
              required
              min={1}
              max={newSignerCount}
              value={badgeThreshold || Math.min(team.threshold, newSignerCount)}
              onChange={(e) => setBadgeThreshold(e.target.value)}
              className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Current threshold: {team.threshold}. After removal:{' '}
              {newSignerCount} signers.
            </p>
          </div>

          {vaults.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Per-Vault Thresholds</p>
              {vaults.map((vault) => (
                <div key={vault.accountAddress} className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    {vault.name}{' '}
                    <span className="font-mono">
                      ({vault.accountAddress.slice(0, 20)}...)
                    </span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={newSignerCount}
                    value={vaultThresholds[vault.accountAddress] ?? '1'}
                    onChange={(e) =>
                      setVaultThresholds((prev) => ({
                        ...prev,
                        [vault.accountAddress]: e.target.value
                      }))
                    }
                    className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Remove-Member Proposal'}
            </Button>
            <Link to="/team">
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
