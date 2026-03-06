import { useAtomRefresh, useAtomValue, Result } from '@effect-atom/atom-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { sessionAtom } from '@/atom/auth'

export function WalletConnect() {
  const sessionResult = useAtomValue(sessionAtom)
  const refreshSession = useAtomRefresh(sessionAtom)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const initRdt = async () => {
      const { getRadixDappToolkit } = await import('@/lib/radixDappToolkit')
      const rdt = getRadixDappToolkit()

      rdt.walletApi.dataRequestControl(async (walletData) => {
        const proofs = walletData.proofs
        if (!proofs || proofs.length === 0) {
          setConnecting(false)
          return
        }

        try {
          const res = await fetch('/auth/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ signedChallenges: proofs })
          })
          if (res.ok) {
            refreshSession()
          }
        } finally {
          setConnecting(false)
        }
      })
    }

    initRdt()
  }, [refreshSession])

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    try {
      const { getRadixDappToolkit } = await import('@/lib/radixDappToolkit')
      const rdt = getRadixDappToolkit()
      rdt.walletApi.sendRequest()
    } catch {
      setConnecting(false)
    }
  }, [])

  const handleLogout = useCallback(async () => {
    await fetch('/auth/logout', { method: 'POST' })
    refreshSession()
  }, [refreshSession])

  return Result.builder(sessionResult)
    .onInitialOrWaiting(() => (
      <Button variant="outline" disabled>
        Loading...
      </Button>
    ))
    .onFailure(() => (
      <Button variant="outline" onClick={handleConnect} disabled={connecting}>
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </Button>
    ))
    .onSuccess((session) => {
      if (!session) {
        return (
          <Button
            variant="outline"
            onClick={handleConnect}
            disabled={connecting}
          >
            {connecting ? 'Connecting...' : 'Connect Wallet'}
          </Button>
        )
      }

      return (
        <div className="flex items-center gap-2">
          <span className="max-w-[160px] truncate font-mono text-xs text-emerald-900/80">
            {session.accountAddress}
          </span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      )
    })
    .render()
}
