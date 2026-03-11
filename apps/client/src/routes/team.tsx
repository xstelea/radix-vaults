import { Result, useAtomRefresh, useAtomValue } from '@effect-atom/atom-react'
import { createFileRoute, Link, ClientOnly } from '@tanstack/react-router'
import { Effect, Exit } from 'effect'
import { useState } from 'react'
import { toast } from 'sonner'
import { sessionAtom } from '@/atom/auth'
import { teamMembersAtom, teamOverviewAtom } from '@/atom/team'
import { envVars } from '@/lib/envVars'
import { TeamService } from '@/services/team'
import { AppApiClient } from '@/lib/apiClient'
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

export const Route = createFileRoute('/team')({
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

      <ClientOnly fallback={<TeamSkeleton />}>
        <TeamContent />
      </ClientOnly>
    </main>
  )
}

function RefreshTeamButton() {
  const refreshOverview = useAtomRefresh(teamOverviewAtom)
  const refreshMembers = useAtomRefresh(teamMembersAtom)
  return (
    <Button
      variant="outline"
      onClick={() => {
        refreshOverview()
        refreshMembers()
      }}
    >
      Refresh
    </Button>
  )
}

function TeamContent() {
  const overviewResult = useAtomValue(teamOverviewAtom)
  const membersResult = useAtomValue(teamMembersAtom)
  const refreshOverview = useAtomRefresh(teamOverviewAtom)

  return Result.builder(overviewResult)
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
          <Button variant="outline" onClick={refreshOverview}>
            Retry
          </Button>
        </CardContent>
      </Card>
    ))
    .onSuccess((overview) => (
      <>
        {overview.hasMismatch && (
          <Card className="border-amber-400/40 bg-amber-50/80">
            <CardContent className="py-4">
              <p className="text-sm font-medium text-amber-900">
                Signer-set mismatch detected — the registered member signer
                sources do not fully cover the on-chain signer set.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Team Overview</CardTitle>
            <CardDescription className="font-mono text-xs truncate">
              <a
                href={`${envVars.DASHBOARD_BASE_URL}/account/${overview.teamAccountAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline text-blue-600"
              >
                {overview.teamAccountAddress}
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
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
              {Result.builder(membersResult)
                .onInitialOrWaiting(() => <Skeleton className="h-20 w-full" />)
                .onFailure(() => (
                  <Card className="border-border bg-accent/30 shadow-none">
                    <CardContent className="py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Badge Holders
                      </p>
                      <p className="mt-1 text-lg font-semibold text-muted-foreground">
                        —
                      </p>
                    </CardContent>
                  </Card>
                ))
                .onSuccess(({ members }) => (
                  <Card className="border-border bg-accent/30 shadow-none">
                    <CardContent className="py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Badge Holders
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {members.length}
                      </p>
                    </CardContent>
                  </Card>
                ))
                .render()}
            </div>

            {Result.builder(membersResult)
              .onInitialOrWaiting(() => (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 w-full" />
                  ))}
                </div>
              ))
              .onFailure((cause) => (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  Could not load team members: {String(cause)}
                </div>
              ))
              .onSuccess(({ badgeAddress, members }) => (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Badge:{' '}
                    <a
                      href={`${envVars.DASHBOARD_BASE_URL}/resource/${badgeAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono hover:underline text-blue-600 truncate inline-block max-w-[40ch] align-bottom"
                    >
                      {badgeAddress}
                    </a>
                  </p>
                  {members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No badge holders found.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account Address</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.map((member) => (
                          <TableRow key={member.holderAddress}>
                            <TableCell className="font-mono text-xs max-w-0">
                              <a
                                href={`${envVars.DASHBOARD_BASE_URL}/account/${member.holderAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline text-blue-600 block truncate"
                              >
                                {member.holderAddress}
                              </a>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              ))
              .render()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>On-chain Signer Set</CardTitle>
            <CardDescription>
              Signers from the team account&apos;s on-chain access rule.
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
            <CardTitle>Registered Member Signer Sources</CardTitle>
            <CardDescription>
              Public keys registered by team members for signing proposals.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {overview.memberSignerSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No signer sources registered yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Key Type</TableHead>
                    <TableHead>Public Key</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.memberSignerSources.map((source) => (
                    <TableRow key={source.accountAddress}>
                      <TableCell className="font-mono text-xs">
                        {source.accountAddress}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{source.keyType}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {source.publicKey}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <ClientOnly>
          <SetSignerSourceForm onSuccess={refreshOverview} />
        </ClientOnly>
      </>
    ))
    .render()
}

function SetSignerSourceForm({ onSuccess }: { onSuccess: () => void }) {
  const sessionResult = useAtomValue(sessionAtom)
  const session = Result.builder(sessionResult)
    .onInitialOrWaiting(() => null)
    .onFailure(() => null)
    .onSuccess((s) => s)
    .render()

  const [publicKey, setPublicKey] = useState('')
  const [keyType, setKeyType] = useState<'ed25519' | 'secp256k1'>('ed25519')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!session) return null

  const handleSet = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const program = Effect.gen(function* () {
      const svc = yield* TeamService
      return yield* svc.setSignerSource(publicKey.trim(), keyType)
    }).pipe(
      Effect.provide(TeamService.Default),
      Effect.provide(AppApiClient.Default)
    )

    const exit = await Effect.runPromiseExit(program)
    setSubmitting(false)

    Exit.match(exit, {
      onFailure: (cause) =>
        setError(`Failed to set signer source: ${String(cause)}`),
      onSuccess: () => {
        toast.success('Signer source set successfully')
        setPublicKey('')
        onSuccess()
      }
    })
  }

  const handleClear = async () => {
    setError(null)
    setSubmitting(true)

    const program = Effect.gen(function* () {
      const svc = yield* TeamService
      return yield* svc.clearSignerSource()
    }).pipe(
      Effect.provide(TeamService.Default),
      Effect.provide(AppApiClient.Default)
    )

    const exit = await Effect.runPromiseExit(program)
    setSubmitting(false)

    Exit.match(exit, {
      onFailure: (cause) =>
        setError(`Failed to clear signer source: ${String(cause)}`),
      onSuccess: () => {
        toast.success('Signer source cleared')
        onSuccess()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Signer Source</CardTitle>
        <CardDescription>
          Set or clear your Ed25519/Secp256k1 public key used for signing
          proposals.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSet} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="publicKey" className="text-sm font-medium">
              Public Key
            </label>
            <input
              id="publicKey"
              type="text"
              required
              placeholder="Hex-encoded public key..."
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              className="w-full rounded-lg border border-input bg-white px-3 py-2 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="keyType" className="text-sm font-medium">
              Key Type
            </label>
            <select
              id="keyType"
              value={keyType}
              onChange={(e) =>
                setKeyType(e.target.value as 'ed25519' | 'secp256k1')
              }
              className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="ed25519">Ed25519</option>
              <option value="secp256k1">Secp256k1</option>
            </select>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Setting...' : 'Set Signer Source'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={handleClear}
            >
              {submitting ? 'Clearing...' : 'Clear My Source'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function TeamSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-2/3" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
