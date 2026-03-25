import { Result, useAtomRefresh, useAtomValue } from '@effect-atom/atom-react'
import { createFileRoute, Link, ClientOnly } from '@tanstack/react-router'
import { teamProposalListAtom } from '@/atom/teamProposals'
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

export const Route = createFileRoute('/teams/$teamId/team/proposals/')({
  component: TeamProposalsPage
})

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

const typeLabel: Record<string, string> = {
  add_member: 'Add Member',
  remove_member: 'Remove Member',
  change_threshold: 'Change Threshold'
}

function TeamProposalsPage() {
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
          <span className="text-foreground font-medium">Team Proposals</span>
        </nav>
        <ClientOnly
          fallback={
            <Button variant="outline" disabled aria-label="Refresh">
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
        <TeamProposalsList teamId={teamId} />
      </ClientOnly>
    </main>
  )
}

function RefreshButton() {
  const { teamId } = Route.useParams()
  const refresh = useAtomRefresh(teamProposalListAtom(teamId))
  return (
    <Button variant="outline" onClick={refresh} aria-label="Refresh">
      <RefreshCw className="h-4 w-4" />
    </Button>
  )
}

function TeamProposalsList({ teamId }: { teamId: string }) {
  const result = useAtomValue(teamProposalListAtom(teamId))
  const refresh = useAtomRefresh(teamProposalListAtom(teamId))

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
            Could not load team proposals
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
          <CardTitle>Team Proposals</CardTitle>
          <CardDescription>
            {proposals.length === 0
              ? 'No team proposals yet.'
              : `${proposals.length} proposal${proposals.length === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        {proposals.length > 0 && (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Created By
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Created
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposals.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        to="/teams/$teamId/team/proposals/$proposalId"
                        params={{ teamId, proposalId: String(p.id) }}
                        className="font-medium underline decoration-muted-foreground/40 hover:decoration-foreground"
                      >
                        #{p.id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {typeLabel[p.type] ?? p.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[p.status] ?? 'outline'}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-xs">
                      {p.createdByName ?? `${p.createdBy.slice(0, 20)}...`}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
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
