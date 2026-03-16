import {
  Link,
  ClientOnly,
  useNavigate,
  createFileRoute
} from '@tanstack/react-router'
import { Result, useAtomRefresh, useAtomValue } from '@effect-atom/atom-react'
import { pendingProposalsAtom } from '@/atom/pendingProposals'
import type { PendingProposalListItem } from '@radix-vaults/shared'
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

export const Route = createFileRoute('/')({
  component: HomePage
})

function HomePage() {
  return (
    <main className="max-w-5xl space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl">Dashboard</CardTitle>
            <CardDescription>
              Overview of pending proposals across all vaults.
            </CardDescription>
          </div>
          <ClientOnly
            fallback={
              <Button variant="outline" disabled>
                Refresh
              </Button>
            }
          >
            <RefreshButton />
          </ClientOnly>
        </CardHeader>
      </Card>
      <ClientOnly
        fallback={
          <Card>
            <CardHeader>
              <Skeleton className="h-7 w-48" />
            </CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        }
      >
        <PendingProposalsSection />
      </ClientOnly>
    </main>
  )
}

function RefreshButton() {
  const refreshPending = useAtomRefresh(pendingProposalsAtom)
  return (
    <Button variant="outline" onClick={() => refreshPending()}>
      Refresh
    </Button>
  )
}

const statusVariant: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  created: 'outline',
  signing: 'secondary',
  ready: 'default'
}

const typeLabel: Record<string, string> = {
  vault: 'Vault',
  add_member: 'Add Member',
  remove_member: 'Remove Member',
  change_threshold: 'Change Threshold'
}

function proposalHref(p: PendingProposalListItem) {
  if (p.type === 'vault') {
    return `/vaults/${p.entityAddress}/proposals/${p.id}`
  }
  return `/team/proposals/${p.id}`
}

function ProposalRow({ proposal: p }: { proposal: PendingProposalListItem }) {
  const navigate = useNavigate()
  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => navigate({ to: proposalHref(p) })}
    >
      <TableCell className="font-medium">#{p.id}</TableCell>
      <TableCell>
        <Badge variant="outline">{typeLabel[p.type] ?? p.type}</Badge>
      </TableCell>
      <TableCell className="max-w-[200px] truncate font-mono text-xs">
        {p.entityName ?? `${p.entityAddress.slice(0, 20)}...`}
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant[p.status] ?? 'outline'}>{p.status}</Badge>
      </TableCell>
      <TableCell className="font-mono text-xs">
        {p.createdByName ?? `${p.createdBy.slice(0, 20)}...`}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(p.createdAt).toLocaleString()}
      </TableCell>
    </TableRow>
  )
}

function PendingProposalsSection() {
  const result = useAtomValue(pendingProposalsAtom)
  const refresh = useAtomRefresh(pendingProposalsAtom)

  return Result.builder(result)
    .onInitialOrWaiting(() => (
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-48" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    ))
    .onFailure((cause) => (
      <Card className="border-red-900/20 bg-red-50/80">
        <CardHeader>
          <CardTitle className="text-base">
            Could not load pending proposals
          </CardTitle>
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
    .onSuccess((proposals) => (
      <Card>
        <CardHeader>
          <CardTitle>Pending Proposals</CardTitle>
          <CardDescription>
            {proposals.length === 0
              ? 'No pending proposals.'
              : `${proposals.length} pending proposal${proposals.length === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        {proposals.length > 0 && (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposals.map((p) => (
                  <ProposalRow key={p.id} proposal={p} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    ))
    .render()
}
