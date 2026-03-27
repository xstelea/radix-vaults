import { Menu } from 'lucide-react'
import ConnectButton from '@/components/ConnectButton'

export function AppHeader({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="top-bar">
      <button
        className="lg:hidden mr-auto p-2 rounded-lg hover:bg-accent"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <ConnectButton />
    </header>
  )
}
