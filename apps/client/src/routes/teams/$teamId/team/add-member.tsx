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
import { AddressLink } from '@/components/AddressLink'
import { teamOverviewAtom } from '@/atom/team'
import {
  createAddMemberProposal,
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

export const Route = createFileRoute('/teams/$teamId/team/add-member')({
  component: AddMemberPage
})

function AddMemberPage() {
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
        <span className="text-foreground font-medium">Add Member</span>
      </nav>

      <ClientOnly fallback={<Skeleton className="h-96 w-full" />}>
        <AddMemberForm teamId={teamId} />
      </ClientOnly>
    </main>
  )
}

function AddMemberForm({ teamId }: { teamId: string }) {
  const navigate = useNavigate()
  const refreshTeam = useAtomRefresh(teamOverviewAtom(teamId))
  const refreshProposals = useAtomRefresh(teamProposalListAtom(teamId))
  const [, dispatch] = useAtom(createAddMemberProposal, {
    mode: 'promiseExit'
  })

  const teamResult = useAtomValue(teamOverviewAtom(teamId))
  const vaultsResult = useAtomValue(vaultsListAtom(teamId))

  const [accountAddress, setAccountAddress] = useState('')
  const [virtualBadge, setVirtualBadge] = useState('')
  const [memberName, setMemberName] = useState('')
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const exit = await dispatch({
      teamId,
      input: {
        accountAddress: accountAddress.trim(),
        virtualBadge: virtualBadge.trim(),
        name: memberName.trim(),
        badgeThreshold: Number(badgeThreshold) || team.threshold,
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
          to: '/teams/$teamId/team/proposals/$proposalId',
          params: { teamId, proposalId: String(result.id) }
        })
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Add Team Member</CardTitle>
        <CardDescription>
          Create a proposal to mint a badge and add a new signer to the team and
          all vaults.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="accountAddress" className="text-sm font-medium">
              Recipient Account Address
            </label>
            <input
              id="accountAddress"
              type="text"
              required
              placeholder="account_tdx_2_1..."
              value={accountAddress}
              onChange={(e) => setAccountAddress(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="memberName" className="text-sm font-medium">
              Member Name
            </label>
            <input
              id="memberName"
              type="text"
              required
              maxLength={100}
              placeholder="Alice"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              A human-readable name for this team member (stored on-ledger in
              the NFT badge).
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="virtualBadge" className="text-sm font-medium">
              Virtual Badge (NonFungibleGlobalId)
            </label>
            <input
              id="virtualBadge"
              type="text"
              required
              placeholder="resource_tdx_2_...ed25sg...:[hex]"
              value={virtualBadge}
              onChange={(e) => setVirtualBadge(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              The new member&apos;s signature virtual badge NonFungibleGlobalId.
            </p>
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
              value={badgeThreshold || team.threshold}
              onChange={(e) => setBadgeThreshold(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Current threshold: {team.threshold}. The team will have{' '}
              {team.signers.length + 1} signers after this addition.
            </p>
          </div>

          {vaults.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Per-Vault Thresholds</p>
              {vaults.map((vault) => (
                <div key={vault.accountAddress} className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {vault.name} (<AddressLink address={vault.accountAddress} />
                    )
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={vaultThresholds[vault.accountAddress] ?? '1'}
                    onChange={(e) =>
                      setVaultThresholds((prev) => ({
                        ...prev,
                        [vault.accountAddress]: e.target.value
                      }))
                    }
                    className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              ))}
            </div>
          )}

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
              {submitting ? 'Creating...' : 'Propose Member Add'}
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
