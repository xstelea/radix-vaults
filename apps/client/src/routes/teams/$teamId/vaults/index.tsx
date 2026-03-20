import { Link, ClientOnly, createFileRoute } from '@tanstack/react-router'
import { Result, useAtomRefresh, useAtomValue } from '@effect-atom/atom-react'
import { sessionAtom } from '@/atom/auth'
import { vaultsListAtom } from '@/atom/vaults'
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
import { PlusCircle, Download } from 'lucide-react'

export const Route = createFileRoute('/teams/$teamId/vaults/')({
  component: VaultsPage
})

function VaultsPage() {
  const { teamId } = Route.useParams()

  return (
    <main className="max-w-5xl space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground font-medium">Vaults</span>
      </nav>

      <Card>
        <ClientOnly
          fallback={
            <CardHeader>
              <CardTitle className="text-2xl">Vaults</CardTitle>
              <CardDescription>Manage your multisig vaults.</CardDescription>
            </CardHeader>
          }
        >
          <VaultHeader teamId={teamId} />
        </ClientOnly>
      </Card>

      <ClientOnly fallback={<DashboardSkeleton />}>
        <VaultsList teamId={teamId} />
      </ClientOnly>
    </main>
  )
}

function VaultHeader({ teamId }: { teamId: string }) {
  const sessionResult = useAtomValue(sessionAtom)
  const session = Result.builder(sessionResult)
    .onInitialOrWaiting(() => null)
    .onFailure(() => null)
    .onSuccess((s) => s)
    .render()

  if (!session) {
    return (
      <CardHeader>
        <CardTitle className="text-2xl">Vaults</CardTitle>
        <CardDescription>Manage your multisig vaults.</CardDescription>
      </CardHeader>
    )
  }

  return (
    <CardHeader className="flex flex-row items-start justify-between gap-4">
      <div>
        <CardTitle className="text-2xl">Vaults</CardTitle>
        <CardDescription>Manage your multisig vaults.</CardDescription>
      </div>
      <div className="flex gap-2">
        <Link to="/teams/$teamId/vaults/create" params={{ teamId }}>
          <Button size="sm">
            <PlusCircle className="mr-1.5 h-4 w-4" />
            Create Vault
          </Button>
        </Link>
        <Link to="/teams/$teamId/vaults/add" params={{ teamId }}>
          <Button variant="outline" size="sm">
            <Download className="mr-1.5 h-4 w-4" />
            Import Vault
          </Button>
        </Link>
      </div>
    </CardHeader>
  )
}

function VaultsList({ teamId }: { teamId: string }) {
  const vaultsResult = useAtomValue(vaultsListAtom(teamId))
  const refreshVaults = useAtomRefresh(vaultsListAtom(teamId))

  return Result.builder(vaultsResult)
    .onInitialOrWaiting(() => <DashboardSkeleton />)
    .onFailure((cause) => (
      <Card className="border-red-900/20 bg-red-50/80">
        <CardHeader>
          <CardTitle className="text-base">Could not load vaults</CardTitle>
          <CardDescription className="text-red-900/90">
            {String(cause)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={refreshVaults}>
            Retry
          </Button>
        </CardContent>
      </Card>
    ))
    .onSuccess((vaults) => {
      if (vaults.length === 0) {
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No vaults yet</CardTitle>
              <CardDescription>
                Create or import a vault to get started.
              </CardDescription>
            </CardHeader>
          </Card>
        )
      }

      return (
        <div className="grid gap-3">
          {vaults.map((vault) => (
            <Link
              key={vault.accountAddress}
              to="/teams/$teamId/vaults/$vaultId"
              params={{ teamId, vaultId: vault.accountAddress }}
            >
              <Card className="transition hover:-translate-y-0.5 hover:shadow-md hover:border-border">
                <CardContent className="flex items-center justify-between gap-3 py-5">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">
                      {vault.name}
                    </h2>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {vault.accountAddress}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {vault.pendingProposalCount} pending
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )
    })
    .render()
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardContent className="flex items-center justify-between gap-3 py-5">
            <div className="w-full space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
