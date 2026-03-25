import { Result, useAtomRefresh, useAtomValue } from '@effect-atom/atom-react'
import {
  createFileRoute,
  Link,
  ClientOnly,
  useNavigate
} from '@tanstack/react-router'
import { pendingProposalsAtom } from '@/atom/pendingProposals'
import { useTeamName } from '@/hooks/useNames'
import { RefreshCw } from 'lucide-react'
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

export const Route = createFileRoute('/teams/$teamId/')({
  component: DashboardPage
})

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

function DashboardPage() {
  const { teamId } = Route.useParams()
  const teamName = useTeamName(teamId)
  return (
    <main className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav className="text-sm text-muted-foreground sm:min-h-10 flex items-center flex-wrap">
          <Link to="/" className="hover:text-foreground">
            My Teams
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground font-medium">{teamName}</span>
        </nav>
        <ClientOnly
          fallback={
            <Button variant="outline" disabled>
              <RefreshCw className="h-4 w-4" />
            </Button>
          }
        >
          <RefreshButton />
        </ClientOnly>
      </div>

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
        <PendingProposalsList teamId={teamId} />
      </ClientOnly>
    </main>
  )
}

function RefreshButton() {
  const { teamId } = Route.useParams()
  const refresh = useAtomRefresh(pendingProposalsAtom(teamId))
  return (
    <Button variant="outline" onClick={refresh}>
      <RefreshCw className="h-4 w-4" />
    </Button>
  )
}

function proposalLink(
  teamId: string,
  proposal: { id: number; type: string; entityAddress: string }
) {
  if (proposal.type === 'vault') {
    return {
      to: '/teams/$teamId/vaults/$vaultId/proposals/$proposalId' as const,
      params: {
        teamId,
        vaultId: proposal.entityAddress,
        proposalId: String(proposal.id)
      }
    }
  }
  return {
    to: '/teams/$teamId/team/proposals/$proposalId' as const,
    params: { teamId, proposalId: String(proposal.id) }
  }
}

function ClickableProposalRow({
  teamId,
  proposal: p
}: {
  teamId: string
  proposal: {
    id: number
    type: string
    entityAddress: string
    entityName?: string | null
    status: string
    createdBy: string
    createdByName?: string | null
    createdAt: string
  }
}) {
  const navigate = useNavigate()
  const link = proposalLink(teamId, p)
  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => navigate({ to: link.to, params: link.params })}
    >
      <TableCell className="font-medium">#{p.id}</TableCell>
      <TableCell>
        <Badge variant="outline">{typeLabel[p.type] ?? p.type}</Badge>
      </TableCell>
      <TableCell className="text-sm">
        {p.entityName ??
          `${p.entityAddress.slice(0, 16)}...${p.entityAddress.slice(-6)}`}
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

function PendingProposalsList({ teamId }: { teamId: string }) {
  const result = useAtomValue(pendingProposalsAtom(teamId))
  const refresh = useAtomRefresh(pendingProposalsAtom(teamId))

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
              ? 'No pending proposals for this team.'
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
                  <ClickableProposalRow
                    key={p.id}
                    teamId={teamId}
                    proposal={p}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    ))
    .render()
}
