import { Link, ClientOnly, createFileRoute } from '@tanstack/react-router'
import { Result, useAtomRefresh, useAtomValue } from '@effect-atom/atom-react'
import { teamsListAtom } from '@/atom/teams'
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
import { Plus, Users } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: HomePage
})

function HomePage() {
  return (
    <main className="max-w-5xl space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl">Teams</CardTitle>
            <CardDescription>
              Select a team or create a new one to get started.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <ClientOnly
              fallback={
                <Button variant="outline" disabled>
                  Refresh
                </Button>
              }
            >
              <RefreshButton />
            </ClientOnly>
            <Link to="/teams/create">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Team
              </Button>
            </Link>
          </div>
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
        <TeamsListSection />
      </ClientOnly>
    </main>
  )
}

function RefreshButton() {
  const refresh = useAtomRefresh(teamsListAtom)
  return (
    <Button variant="outline" onClick={() => refresh()}>
      Refresh
    </Button>
  )
}

function TeamsListSection() {
  const result = useAtomValue(teamsListAtom)
  const refresh = useAtomRefresh(teamsListAtom)

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
          <CardTitle className="text-base">Could not load teams</CardTitle>
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
    .onSuccess((teams) => (
      <Card>
        <CardHeader>
          <CardTitle>Your Teams</CardTitle>
          <CardDescription>
            {teams.length === 0
              ? 'You are not a member of any teams yet.'
              : `${teams.length} team${teams.length === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        {teams.length > 0 ? (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Badge Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map((team) => (
                  <TableRow key={team.teamId} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link
                        to="/teams/$teamId/vaults"
                        params={{ teamId: team.teamId }}
                        className="flex items-center gap-2"
                      >
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {team.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {team.badgeAddress.slice(0, 20)}...
                      {team.badgeAddress.slice(-8)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        ) : (
          <CardContent>
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                Create your first team to start managing vaults.
              </p>
              <Link to="/teams/create">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Team
                </Button>
              </Link>
            </div>
          </CardContent>
        )}
      </Card>
    ))
    .render()
}
