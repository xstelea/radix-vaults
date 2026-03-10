import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useAtomRefresh } from '@effect-atom/atom-react'
import { VaultAddress } from '@radix-vaults/shared'
import { Effect, Exit } from 'effect'
import { useState } from 'react'
import { toast } from 'sonner'
import { vaultsListAtom } from '@/atom/vaults'
import { VaultService } from '@/services/vault'
import { AppApiClient } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

export const Route = createFileRoute('/vaults/add')({
  component: AddVaultPage
})

function AddVaultPage() {
  const navigate = useNavigate()
  const refreshVaults = useAtomRefresh(vaultsListAtom)
  const [accountAddress, setAccountAddress] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const program = Effect.gen(function* () {
      const svc = yield* VaultService
      return yield* svc.importVault(
        VaultAddress.make(accountAddress.trim()),
        name.trim()
      )
    }).pipe(
      Effect.provide(VaultService.Default),
      Effect.provide(AppApiClient.Default)
    )

    const exit = await Effect.runPromiseExit(program)

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
        toast.success('Vault imported successfully')
        refreshVaults()
        navigate({ to: '/' })
      }
    })
  }

  return (
    <main className="max-w-5xl space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
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
                className="w-full rounded-lg border border-input bg-white px-3 py-2 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
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
                className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
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
              <Link to="/">
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
