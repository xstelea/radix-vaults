import { useAtomMount } from '@effect-atom/atom-react'
import { ClientOnly } from '@tanstack/react-router'
import type React from 'react'
import { rolaVerificationAtom, disconnectSyncAtom } from '@/atom/wallet'

const WalletContent: React.FC = () => {
  useAtomMount(rolaVerificationAtom)
  useAtomMount(disconnectSyncAtom)
  return <radix-connect-button />
}

export default function ConnectButton() {
  return (
    <ClientOnly>
      <WalletContent />
    </ClientOnly>
  )
}
