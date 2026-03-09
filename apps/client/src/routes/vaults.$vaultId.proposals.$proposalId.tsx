import { useState, useCallback } from 'react'
import { Result, useAtomRefresh, useAtomValue } from '@effect-atom/atom-react'
import type { ProposalDetail } from '@radix-vaults/shared'
import { VaultAddress } from '@radix-vaults/shared'
import { createFileRoute, Link, ClientOnly } from '@tanstack/react-router'
import { Effect, Exit } from 'effect'
import { toast } from 'sonner'
import { sessionAtom } from '@/atom/auth'
import { proposalDetailAtom } from '@/atom/proposals'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
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
import { ProposalService } from '@/services/proposal'

export const Route = createFileRoute('/vaults/$vaultId/proposals/$proposalId')({
  component: ProposalDetailPage
})

function ProposalDetailPage() {
  const { vaultId } = Route.useParams()

  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <Link
        to="/vaults/$vaultId"
        params={{ vaultId }}
        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
      >
        Back to vault
      </Link>

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

function ProposalDetailContent() {
  const { vaultId, proposalId } = Route.useParams()
  const vaultAddress = VaultAddress.make(vaultId)
  const detailAtom = proposalDetailAtom({
    vaultAddress,
    proposalId: Number(proposalId)
  })
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
            <Card className="border-emerald-900/10 bg-emerald-50/60 shadow-none">
              <CardContent className="py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900/70">
                  Status
                </p>
                <div className="mt-1">
                  <Badge variant={statusVariant[proposal.status] ?? 'outline'}>
                    {proposal.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card className="border-emerald-900/10 bg-emerald-50/60 shadow-none">
              <CardContent className="py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900/70">
                  Created By
                </p>
                <p className="mt-1 truncate font-mono text-xs">
                  {proposal.createdBy}
                </p>
              </CardContent>
            </Card>
            <Card className="border-emerald-900/10 bg-emerald-50/60 shadow-none">
              <CardContent className="py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900/70">
                  Max Proposer Timestamp
                </p>
                <p className="mt-1 text-sm">{proposal.maxProposerTimestamp}</p>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <SignatureProgressCard
          proposal={proposal}
          vaultAddress={vaultAddress}
          onSigned={refresh}
        />

        <SubmitCard
          proposal={proposal}
          vaultAddress={vaultAddress}
          onSubmitted={refresh}
        />

        {proposal.transactionIntentHash && (
          <Card>
            <CardHeader>
              <CardTitle>Transaction</CardTitle>
              <CardDescription>
                {proposal.submittedAt
                  ? `Submitted ${new Date(proposal.submittedAt).toLocaleString()}`
                  : 'Submission recorded'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900/70">
                Intent Hash
              </p>
              <p className="mt-1 break-all font-mono text-xs">
                {proposal.transactionIntentHash}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Transaction Manifest</CardTitle>
            <CardDescription>
              Created {new Date(proposal.createdAt).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-emerald-200 bg-emerald-50/30 p-4 font-mono text-xs">
              {proposal.manifest}
            </pre>
          </CardContent>
        </Card>
      </>
    ))
    .render()
}

function SignatureProgressCard({
  proposal,
  vaultAddress,
  onSigned
}: {
  proposal: ProposalDetail
  vaultAddress: VaultAddress
  onSigned: () => void
}) {
  const sessionResult = useAtomValue(sessionAtom)
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
      const exit = await Effect.runPromiseExit(
        ProposalService.pipe(
          Effect.flatMap((svc) => svc.sign(vaultAddress, proposal.id)),
          Effect.provide(ProposalService.Default)
        )
      )
      Exit.match(exit, {
        onSuccess: () => {
          toast.success('Proposal signed successfully')
          onSigned()
        },
        onFailure: (cause) => {
          toast.error(`Signing failed: ${String(cause)}`)
        }
      })
    } finally {
      setSigning(false)
    }
  }, [vaultAddress, proposal.id, onSigned])

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
                <TableHead>Key Type</TableHead>
                <TableHead>Key Hash</TableHead>
                <TableHead>Signed At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signatureProgress.signatures.map((sig) => (
                <TableRow key={sig.signerAccountAddress}>
                  <TableCell className="font-mono text-xs">
                    {sig.signerAccountAddress.slice(0, 20)}...
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{sig.signerKeyType}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {sig.signerKeyHash.slice(0, 16)}...
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
  proposal,
  vaultAddress,
  onSubmitted
}: {
  proposal: ProposalDetail
  vaultAddress: VaultAddress
  onSubmitted: () => void
}) {
  const sessionResult = useAtomValue(sessionAtom)
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
      const exit = await Effect.runPromiseExit(
        ProposalService.pipe(
          Effect.flatMap((svc) => svc.submit(vaultAddress, proposal.id)),
          Effect.provide(ProposalService.Default)
        )
      )
      Exit.match(exit, {
        onSuccess: (result) => {
          toast.success(
            `Proposal submitted! Intent hash: ${result.intentHash.slice(0, 16)}...`
          )
          onSubmitted()
        },
        onFailure: (cause) => {
          toast.error(`Submit failed: ${String(cause)}`)
        }
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-emerald-600/20 bg-emerald-50/80">
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
