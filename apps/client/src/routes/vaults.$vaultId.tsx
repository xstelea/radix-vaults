import { Result, useAtomRefresh, useAtomValue } from '@effect-atom/atom-react'
import { VaultAddress } from '@radix-vaults/shared'
import { createFileRoute, Link, ClientOnly } from '@tanstack/react-router'
import { proposalListAtom } from '@/atom/proposals'
import { vaultReadAtom } from '@/atom/vaults'
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

export const Route = createFileRoute('/vaults/$vaultId')({
  component: VaultDetailPage
})

function VaultDetailPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/"
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          Back to dashboard
        </Link>
        <ClientOnly
          fallback={
            <Button variant="outline" disabled>
              Refresh
            </Button>
          }
        >
          <RefreshVaultButton />
        </ClientOnly>
      </div>

      <ClientOnly fallback={<VaultDetailSkeleton />}>
        <VaultReadContent />
      </ClientOnly>

      <ClientOnly
        fallback={
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        }
      >
        <ProposalListSection />
      </ClientOnly>
    </main>
  )
}

function RefreshVaultButton() {
  const { vaultId } = Route.useParams()
  const refresh = useAtomRefresh(vaultReadAtom(VaultAddress.make(vaultId)))

  return (
    <Button variant="outline" onClick={refresh}>
      Refresh
    </Button>
  )
}

function VaultReadContent() {
  const { vaultId } = Route.useParams()
  const readAtom = vaultReadAtom(VaultAddress.make(vaultId))
  const readResult = useAtomValue(readAtom)
  const refresh = useAtomRefresh(readAtom)

  return Result.builder(readResult)
    .onInitialOrWaiting(() => <VaultDetailSkeleton />)
    .onFailure((cause) => (
      <Card className="border-red-900/20 bg-red-50/80">
        <CardHeader>
          <CardTitle className="text-base">Could not load vault</CardTitle>
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
    .onSuccess(({ detail, signers }) => (
      <>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{detail.name}</CardTitle>
            <CardDescription className="font-mono text-xs">
              {detail.accountAddress}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Card className="border-emerald-900/10 bg-emerald-50/60 shadow-none">
              <CardContent className="py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900/70">
                  Balance (XRD)
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {detail.balanceXrd}
                </p>
              </CardContent>
            </Card>
            <Card className="border-emerald-900/10 bg-emerald-50/60 shadow-none">
              <CardContent className="py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900/70">
                  Pending
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {detail.pendingProposalCount}
                </p>
              </CardContent>
            </Card>
            <Card className="border-emerald-900/10 bg-emerald-50/60 shadow-none">
              <CardContent className="py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900/70">
                  Threshold
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {signers.threshold}
                </p>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Signers</CardTitle>
            <CardDescription>
              On-chain signer set reconciled through server gateway reads.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key Type</TableHead>
                  <TableHead>Public Key</TableHead>
                  <TableHead>Key Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signers.signers.map((signer) => (
                  <TableRow key={signer.signerKeyHash}>
                    <TableCell>
                      <Badge variant="outline">{signer.signerKeyType}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {signer.signerPublicKey}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {signer.signerKeyHash}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </>
    ))
    .render()
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

function ProposalListSection() {
  const { vaultId } = Route.useParams()
  const vaultAddress = VaultAddress.make(vaultId)
  const listAtom = proposalListAtom(vaultAddress)
  const listResult = useAtomValue(listAtom)

  return Result.builder(listResult)
    .onInitialOrWaiting(() => (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    ))
    .onFailure(() => null)
    .onSuccess((proposals) => (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Proposals</CardTitle>
            <CardDescription>
              {proposals.length === 0
                ? 'No proposals yet.'
                : `${proposals.length} proposal${proposals.length !== 1 ? 's' : ''}`}
            </CardDescription>
          </div>
          <Link
            to="/vaults/$vaultId/proposals/new"
            params={{ vaultId }}
            className={buttonVariants({ size: 'sm' })}
          >
            New Proposal
          </Link>
        </CardHeader>
        {proposals.length > 0 && (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposals.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        to="/vaults/$vaultId/proposals/$proposalId"
                        params={{ vaultId, proposalId: String(p.id) }}
                        className="font-medium text-emerald-700 underline-offset-4 hover:underline"
                      >
                        #{p.id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[p.status] ?? 'outline'}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.createdBy.slice(0, 20)}...
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    ))
    .render()
}

function VaultDetailSkeleton() {
  return (
    <>
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-2/3" />
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-2/3" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </>
  )
}
