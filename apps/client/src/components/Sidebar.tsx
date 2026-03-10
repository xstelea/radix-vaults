import { Link, useMatches } from '@tanstack/react-router'
import {
  Home,
  Users,
  PlusCircle,
  Download,
  FileText,
  X,
  Shield
} from 'lucide-react'

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/vaults/create', label: 'Create Vault', icon: PlusCircle },
  { to: '/vaults/add', label: 'Import Vault', icon: Download }
] as const

export function Sidebar({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}) {
  const matches = useMatches()

  const vaultMatch = matches.find((m) =>
    m.routeId.startsWith('/vaults/$vaultId')
  )
  const vaultId = (vaultMatch?.params as { vaultId?: string })?.vaultId

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`sidebar fixed z-50 lg:sticky lg:top-0 lg:translate-x-0 transition-transform ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* ── Logo ── */}
        <div className="flex items-center justify-between h-14 px-5">
          <Link to="/" className="flex items-center gap-2.5" onClick={onClose}>
            <Shield
              className="h-5.5 w-5.5 text-safe-green"
              style={{
                filter: 'drop-shadow(0 0 6px oklch(0.55 0.17 155 / 0.5))',
                animation: 'shimmer 3s ease-in-out infinite'
              }}
            />
            <span
              className="text-sm font-medium tracking-wide"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                color: 'oklch(0.82 0 0)',
                letterSpacing: '0.04em'
              }}
            >
              Radix Vaults
            </span>
          </Link>
          <button
            className="lg:hidden p-1 rounded-md hover:bg-white/10 transition-colors"
            onClick={onClose}
          >
            <X className="h-4 w-4" style={{ color: 'oklch(0.6 0 0)' }} />
          </button>
        </div>

        {/* ── Separator ── */}
        <div
          className="mx-5 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, oklch(0.25 0.01 155), transparent)'
          }}
        />

        {/* ── Network badge ── */}
        <div className="flex items-center gap-2 px-5 py-3">
          <span
            className="h-1.5 w-1.5 rounded-full bg-safe-green"
            style={{ animation: 'pulse-dot 2s ease-in-out infinite' }}
          />
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'oklch(0.5 0 0)' }}
          >
            Stokenet
          </span>
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 px-3 py-1 space-y-0.5">
          {navItems.map((item, i) => {
            const isActive =
              item.to === '/'
                ? matches[matches.length - 1]?.routeId === '/'
                : matches.some((m) => m.fullPath.startsWith(item.to))

            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`sidebar-nav-item${isActive ? ' active' : ''}`}
                style={{ animation: `slide-in 300ms ease ${i * 50}ms both` }}
              >
                <item.icon className="sidebar-nav-icon" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* ── Current vault ── */}
        {vaultId && (
          <div className="px-3 pb-4">
            <div className="vault-card space-y-3">
              <div>
                <p
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'oklch(0.5 0 0)' }}
                >
                  Current Vault
                </p>
                <p
                  className="mt-1.5 text-sm font-medium"
                  style={{ color: 'oklch(0.85 0 0)' }}
                >
                  Vault
                </p>
                <p
                  className="text-[11px] font-mono truncate"
                  style={{ color: 'oklch(0.45 0.02 155)' }}
                >
                  {vaultId.slice(0, 12)}...{vaultId.slice(-8)}
                </p>
              </div>
              <Link
                to="/vaults/$vaultId/proposals/new"
                params={{ vaultId }}
                onClick={onClose}
                className="vault-card-btn"
              >
                <FileText className="h-3.5 w-3.5" />
                New Proposal
              </Link>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
