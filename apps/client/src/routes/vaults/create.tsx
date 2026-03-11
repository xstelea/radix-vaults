import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useAtom, useAtomRefresh } from '@effect-atom/atom-react'
import { Exit } from 'effect'
import { useState } from 'react'
import { toast } from 'sonner'
import { createVault, vaultsListAtom } from '@/atom/vaults'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

export const Route = createFileRoute('/vaults/create')({
  component: CreateVaultPage
})

function CreateVaultPage() {
  const navigate = useNavigate()
  const refreshVaults = useAtomRefresh(vaultsListAtom)
  const [, dispatch] = useAtom(createVault, { mode: 'promiseExit' })
  const [name, setName] = useState('')
  const [threshold, setThreshold] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const exit = await dispatch({ name: name.trim(), threshold })

    setSubmitting(false)

    Exit.match(exit, {
      onFailure: (cause) => {
        const msg = String(cause)
        if (msg.includes('ThresholdExceedsSignersError')) {
          setError(
            'Threshold exceeds the number of team signers. Please choose a lower value.'
          )
        } else if (msg.includes('CreateVaultFailedError')) {
          const match = msg.match(/message":\s*"([^"]+)"/)
          setError(match?.[1] ?? 'Vault creation failed. Please try again.')
        } else {
          setError(`Create vault failed: ${msg}`)
        }
      },
      onSuccess: () => {
        toast.success('Vault created successfully')
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
        <span className="text-foreground font-medium">Create Vault</span>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Create Vault</CardTitle>
          <CardDescription>
            Create a new multisig vault on-chain. The vault will use your
            team&apos;s current signer set with the threshold you specify.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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

            <div className="space-y-2">
              <label htmlFor="threshold" className="text-sm font-medium">
                Signature Threshold
              </label>
              <input
                id="threshold"
                type="number"
                required
                min={1}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Vault will use your team&apos;s current signer set. The
                threshold determines how many signatures are required.
              </p>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Vault'}
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
