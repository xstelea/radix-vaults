import { useState, useCallback } from 'react'
import {
  Result,
  useAtom,
  useAtomRefresh,
  useAtomValue
} from '@effect-atom/atom-react'
import type { ProposalDetail } from '@radix-vaults/shared'
import { ProposalId, VaultAddress } from '@radix-vaults/shared'
import { createFileRoute, Link, ClientOnly } from '@tanstack/react-router'
import { Exit } from 'effect'
import { sessionAtom } from '@/atom/auth'
import {
  ProposalDetailKey,
  proposalDetailAtom,
  refreshProposalStatus,
  signProposal,
  submitProposal
} from '@/atom/proposals'
import { TransactionPreviewCard } from '@/components/transaction-preview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

export const Route = createFileRoute(
  '/teams/$teamId/vaults/$vaultId/proposals/$proposalId'
)({
  component: ProposalDetailPage
})

function ProposalDetailPage() {
  const { teamId, vaultId, proposalId } = Route.useParams()

  return (
    <main className="max-w-5xl space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <Link
          to="/teams/$teamId/vaults/$vaultId"
          params={{ teamId, vaultId }}
          className="hover:text-foreground"
        >
          Vault
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground font-medium">
          Proposal #{proposalId}
        </span>
      </nav>

      <ClientOnly
        fallback={
          <>
            <Card>
              <CardHeader>
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-2/3" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-40 w-full" />
              </CardContent>
            </Card>
          </>
        }
      >
        <ProposalDetailContent />
      </ClientOnly>
    </main>
  )
}

const statusVariant: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  created: 'outline',
  signing: 'secondary',
  ready: 'default',
  submitted: 'secondary',
  committed: 'default',
  failed: 'destructive',
  expired: 'destructive',
  invalid: 'destructive'
}

const SIGNABLE_STATUSES = new Set(['created', 'signing'])
const TERMINAL_STATUSES = new Set(['committed', 'failed', 'expired', 'invalid'])

function ProposalDetailContent() {
  const { teamId, vaultId, proposalId } = Route.useParams()
  const vaultAddress = VaultAddress.make(vaultId)
  const detailAtom = proposalDetailAtom(
    ProposalDetailKey({
      teamId,
      vaultAddress,
      proposalId: ProposalId.make(Number(proposalId))
    })
  )
  const detailResult = useAtomValue(detailAtom)
  const refresh = useAtomRefresh(detailAtom)

  return Result.builder(detailResult)
    .onInitialOrWaiting(() => (
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-2/3" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    ))
    .onFailure((cause) => (
      <Card className="border-red-900/20 bg-red-50/80">
        <CardHeader>
          <CardTitle className="text-base">Could not load proposal</CardTitle>
          <CardDescription className="text-red-900/90">
            {String(cause)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={refresh}>
            Retry
          </Button>
        </CardContent>
      </Card>
    ))
    .onSuccess((proposal) => (
      <>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl">
                Proposal #{proposal.id}
              </CardTitle>
              <CardDescription className="font-mono text-xs">
                {proposal.vaultAddress}
              </CardDescription>
            </div>
            <Button variant="outline" onClick={refresh}>
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Card className="border-border bg-accent/30 shadow-none">
              <CardContent className="py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Status
                </p>
                <div className="mt-1">
                  <Badge variant={statusVariant[proposal.status] ?? 'outline'}>
                    {proposal.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-accent/30 shadow-none">
              <CardContent className="py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Created By
                </p>
                <p className="mt-1 truncate font-mono text-xs">
                  {proposal.createdByName ?? proposal.createdBy}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border bg-accent/30 shadow-none">
              <CardContent className="py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Max Proposer Timestamp
                </p>
                <p className="mt-1 text-sm">{proposal.maxProposerTimestamp}</p>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        {proposal.statusReason && (
          <Card className="border-red-900/20 bg-red-50/80">
            <CardHeader>
              <CardTitle className="text-base text-red-900">
                {proposal.status === 'expired'
                  ? 'Proposal Expired'
                  : 'Proposal Invalid'}
              </CardTitle>
              <CardDescription className="text-red-900/80">
                {proposal.statusReason}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <SignatureProgressCard
          teamId={teamId}
          proposal={proposal}
          vaultAddress={vaultAddress}
          onSigned={refresh}
        />

        <SubmitCard
          teamId={teamId}
          proposal={proposal}
          vaultAddress={vaultAddress}
          onSubmitted={refresh}
        />

        {proposal.transactionIntentHash && (
          <TransactionInfoCard
            teamId={teamId}
            proposal={proposal}
            vaultAddress={vaultAddress}
            onStatusRefreshed={refresh}
          />
        )}

        {!TERMINAL_STATUSES.has(proposal.status) && (
          <TransactionPreviewCard manifest={proposal.manifest} />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Transaction Manifest</CardTitle>
            <CardDescription>
              Created {new Date(proposal.createdAt).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-4 font-mono text-xs">
              {proposal.manifest}
            </pre>
          </CardContent>
        </Card>
      </>
    ))
    .render()
}

function SignatureProgressCard({
  teamId,
  proposal,
  vaultAddress,
  onSigned
}: {
  teamId: string
  proposal: ProposalDetail
  vaultAddress: VaultAddress
  onSigned: () => void
}) {
  const sessionResult = useAtomValue(sessionAtom)
  const [, dispatch] = useAtom(signProposal, { mode: 'promiseExit' })
  const [signing, setSigning] = useState(false)

  const session = Result.builder(sessionResult)
    .onInitialOrWaiting(() => null)
    .onFailure(() => null)
    .onSuccess((s) => s)
    .render()

  const { signatureProgress } = proposal
  const isSignable = SIGNABLE_STATUSES.has(proposal.status)

  const handleSign = useCallback(async () => {
    setSigning(true)
    try {
      const exit = await dispatch({
        teamId,
        vaultAddress,
        proposalId: proposal.id,
        proposal
      })
      Exit.match(exit, {
        onSuccess: () => onSigned(),
        onFailure: () => {}
      })
    } finally {
      setSigning(false)
    }
  }, [teamId, vaultAddress, proposal, onSigned, dispatch])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Signature Progress</CardTitle>
          <CardDescription>
            {signatureProgress.collected} of {signatureProgress.required}{' '}
            signatures collected
          </CardDescription>
        </div>
        {isSignable && session && (
          <Button onClick={handleSign} disabled={signing} size="sm">
            {signing ? 'Signing...' : 'Sign Proposal'}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {signatureProgress.signatures.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Signer</TableHead>
                <TableHead>Signed At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signatureProgress.signatures.map((sig) => (
                <TableRow key={sig.signerAccountAddress}>
                  <TableCell className="font-mono text-xs">
                    {sig.signerName ??
                      `${sig.signerAccountAddress.slice(0, 20)}...`}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(sig.signedAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">
            No signatures yet. Eligible signers can sign this proposal.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function SubmitCard({
  teamId,
  proposal,
  vaultAddress,
  onSubmitted
}: {
  teamId: string
  proposal: ProposalDetail
  vaultAddress: VaultAddress
  onSubmitted: () => void
}) {
  const sessionResult = useAtomValue(sessionAtom)
  const [, dispatch] = useAtom(submitProposal, { mode: 'promiseExit' })
  const [submitting, setSubmitting] = useState(false)

  const session = Result.builder(sessionResult)
    .onInitialOrWaiting(() => null)
    .onFailure(() => null)
    .onSuccess((s) => s)
    .render()

  if (proposal.status !== 'ready' || !session) return null

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const exit = await dispatch({
        teamId,
        vaultAddress,
        proposalId: proposal.id
      })
      Exit.match(exit, {
        onSuccess: () => onSubmitted(),
        onFailure: () => {}
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-green-200 bg-green-50/80">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Ready to Submit</CardTitle>
          <CardDescription>
            All required signatures collected. Submit the transaction to the
            network.
          </CardDescription>
        </div>
        <Button onClick={handleSubmit} disabled={submitting} size="sm">
          {submitting ? 'Submitting...' : 'Submit Transaction'}
        </Button>
      </CardHeader>
    </Card>
  )
}

function TransactionInfoCard({
  teamId,
  proposal,
  vaultAddress,
  onStatusRefreshed
}: {
  teamId: string
  proposal: ProposalDetail
  vaultAddress: VaultAddress
  onStatusRefreshed: () => void
}) {
  const sessionResult = useAtomValue(sessionAtom)
  const [, dispatch] = useAtom(refreshProposalStatus, { mode: 'promiseExit' })
  const [checking, setChecking] = useState(false)

  const session = Result.builder(sessionResult)
    .onInitialOrWaiting(() => null)
    .onFailure(() => null)
    .onSuccess((s) => s)
    .render()

  const canCheckStatus = proposal.status === 'submitted' && session

  const handleCheckStatus = useCallback(async () => {
    setChecking(true)
    try {
      const exit = await dispatch({
        teamId,
        vaultAddress,
        proposalId: proposal.id
      })
      Exit.match(exit, {
        onSuccess: () => onStatusRefreshed(),
        onFailure: () => {}
      })
    } finally {
      setChecking(false)
    }
  }, [teamId, vaultAddress, proposal.id, onStatusRefreshed, dispatch])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Transaction</CardTitle>
          <CardDescription>
            {proposal.submittedAt
              ? `Submitted ${new Date(proposal.submittedAt).toLocaleString()}`
              : 'Submission recorded'}
          </CardDescription>
        </div>
        {canCheckStatus && (
          <Button
            variant="outline"
            onClick={handleCheckStatus}
            disabled={checking}
            size="sm"
          >
            {checking ? 'Checking...' : 'Check Status'}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Transaction ID
        </p>
        <a
          href={`${Number(import.meta.env.VITE_NETWORK_ID ?? '2') === 1 ? 'https://dashboard.radixdlt.com' : 'https://stokenet-dashboard.radixdlt.com'}/transaction/${proposal.transactionIntentHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block break-all font-mono text-xs underline decoration-muted-foreground/40 hover:decoration-foreground"
        >
          {proposal.transactionIntentHash}
        </a>
      </CardContent>
    </Card>
  )
}
