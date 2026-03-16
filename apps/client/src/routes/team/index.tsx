import { Result, useAtomRefresh, useAtomValue } from '@effect-atom/atom-react'
import { createFileRoute, Link, ClientOnly } from '@tanstack/react-router'
import { teamOverviewAtom } from '@/atom/team'
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

export const Route = createFileRoute('/team/')({
  component: TeamPage
})

function TeamPage() {
  return (
    <main className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <nav className="text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground font-medium">Team</span>
        </nav>
        <div className="flex gap-2">
          <Link to="/team/proposals">
            <Button variant="outline">Team Proposals</Button>
          </Link>
          <Link to="/team/add-member">
            <Button>Add Member</Button>
          </Link>
          <ClientOnly
            fallback={
              <Button variant="outline" disabled>
                Refresh
              </Button>
            }
          >
            <RefreshTeamButton />
          </ClientOnly>
        </div>
      </div>

      <ClientOnly fallback={<TeamSkeleton />}>
        <TeamContent />
      </ClientOnly>
    </main>
  )
}

function RefreshTeamButton() {
  const refresh = useAtomRefresh(teamOverviewAtom)
  return (
    <Button variant="outline" onClick={refresh}>
      Refresh
    </Button>
  )
}

function TeamContent() {
  const result = useAtomValue(teamOverviewAtom)
  const refresh = useAtomRefresh(teamOverviewAtom)

  return Result.builder(result)
    .onInitialOrWaiting(() => <TeamSkeleton />)
    .onFailure((cause) => (
      <Card className="border-red-900/20 bg-red-50/80">
        <CardHeader>
          <CardTitle className="text-base">
            Could not load team overview
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
    .onSuccess((overview) => (
      <>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Team Overview</CardTitle>
            <CardDescription className="font-mono text-xs">
              {overview.teamMemberBadgeAddress}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Card className="border-border bg-accent/30 shadow-none">
              <CardContent className="py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Threshold
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {overview.threshold}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border bg-accent/30 shadow-none">
              <CardContent className="py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  On-chain Signers
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {overview.signers.length}
                </p>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>On-chain Signer Set</CardTitle>
            <CardDescription>
              Signers from the badge resource&apos;s on-chain owner role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key Type</TableHead>
                  <TableHead>Badge ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.signers.map((signer) => (
                  <TableRow key={signer.signerKeyHash}>
                    <TableCell>
                      <Badge variant="outline">{signer.signerKeyType}</Badge>
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

        <Card>
          <CardHeader>
            <CardTitle>Badge Holders</CardTitle>
            <CardDescription>
              Accounts holding the team member badge.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key Type</TableHead>
                  <TableHead>Badge ID</TableHead>
                  <TableHead>Account Address</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.badgeHolders.map((holder) => (
                  <TableRow key={holder.holderAddress}>
                    <TableCell className="font-medium">{holder.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{holder.keyType}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {holder.localId}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {holder.holderAddress}
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/team/remove-member"
                        search={{
                          address: holder.holderAddress
                        }}
                      >
                        <Button variant="outline" size="sm">
                          Remove
                        </Button>
                      </Link>
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

function TeamSkeleton() {
  return (
    <>
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-2/3" />
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
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
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-36" />
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
