import { Link, ClientOnly } from '@tanstack/react-router'
import { Result, useAtomRefresh, useAtomValue } from '@effect-atom/atom-react'
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

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage
})

function HomePage() {
  return (
    <main className="max-w-5xl space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl">Vault Dashboard</CardTitle>
            <CardDescription>
              Public vault read surface with pending proposal counts.
            </CardDescription>
          </div>
          <ClientOnly
            fallback={
              <Button variant="outline" disabled>
                Refresh
              </Button>
            }
          >
            <RefreshVaultsButton />
          </ClientOnly>
        </CardHeader>
      </Card>
      <ClientOnly fallback={<DashboardSkeleton />}>
        <VaultsList />
      </ClientOnly>
    </main>
  )
}

function RefreshVaultsButton() {
  const refreshVaults = useAtomRefresh(vaultsListAtom)
  return (
    <Button variant="outline" onClick={refreshVaults}>
      Refresh
    </Button>
  )
}

function VaultsList() {
  const vaultsResult = useAtomValue(vaultsListAtom)
  const refreshVaults = useAtomRefresh(vaultsListAtom)

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
                Create or import a vault to see it on the dashboard.
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
              to="/vaults/$vaultId"
              params={{ vaultId: vault.accountAddress }}
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
