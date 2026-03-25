import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useAtom, useAtomRefresh } from '@effect-atom/atom-react'
import { VaultAddress } from '@radix-vaults/shared'
import { useTeamName } from '@/hooks/useNames'
import { Exit } from 'effect'
import { useState } from 'react'
import { importVault, vaultsListAtom } from '@/atom/vaults'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

export const Route = createFileRoute('/teams/$teamId/vaults/add')({
  component: AddVaultPage
})

function AddVaultPage() {
  const { teamId } = Route.useParams()
  const navigate = useNavigate()
  const teamName = useTeamName(teamId)
  const refreshVaults = useAtomRefresh(vaultsListAtom(teamId))
  const [, dispatch] = useAtom(importVault, { mode: 'promiseExit' })
  const [accountAddress, setAccountAddress] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const exit = await dispatch({
      teamId,
      accountAddress: VaultAddress.make(accountAddress.trim()),
      name: name.trim()
    })

    setSubmitting(false)

    Exit.match(exit, {
      onFailure: (cause) => {
        const msg = String(cause)
        if (msg.includes('UnsupportedAccessRuleError')) {
          setError(
            'This account does not have a supported multisig access rule (CountOf or AllOf).'
          )
        } else if (msg.includes('VaultAlreadyExistsError')) {
          setError('This vault has already been imported.')
        } else {
          setError(`Import failed: ${msg}`)
        }
      },
      onSuccess: () => {
        refreshVaults()
        navigate({ to: '/teams/$teamId/vaults', params: { teamId } })
      }
    })
  }

  return (
    <main className="max-w-5xl space-y-6">
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
          to="/teams/$teamId/vaults"
          params={{ teamId }}
          className="hover:text-foreground"
        >
          Vaults
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground font-medium">Import Vault</span>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Import Vault</CardTitle>
          <CardDescription>
            Import an existing multisig account as a vault. The account must
            have a supported access rule (CountOf or AllOf of signature badges).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="accountAddress" className="text-sm font-medium">
                Account Address
              </label>
              <input
                id="accountAddress"
                type="text"
                required
                placeholder="account_tdx_2_1..."
                value={accountAddress}
                onChange={(e) => setAccountAddress(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Display Name
              </label>
              <input
                id="name"
                type="text"
                required
                placeholder="My Multisig Vault"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={255}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Importing...' : 'Import Vault'}
              </Button>
              <Link to="/teams/$teamId/vaults" params={{ teamId }}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
