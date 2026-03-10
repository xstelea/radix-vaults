import { useAtomMount } from '@effect-atom/atom-react'
import { ClientOnly } from '@tanstack/react-router'
import type React from 'react'
import { rolaVerificationAtom, disconnectSyncAtom } from '@/atom/wallet'

const WalletContent: React.FC = () => {
  useAtomMount(rolaVerificationAtom)
  useAtomMount(disconnectSyncAtom)
  return (
    <radix-connect-button
      style={
        {
          '--radix-connect-button-width': '36px',
          '--radix-connect-button-border-radius': '6px'
        } as React.CSSProperties
      }
    />
  )
}

export default function ConnectButton() {
  return (
    <ClientOnly>
      <WalletContent />
    </ClientOnly>
  )
}
