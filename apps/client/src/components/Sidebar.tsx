import { Link, useMatches } from '@tanstack/react-router'
import { Home, Users, FileText, X, Shield } from 'lucide-react'

export function Sidebar({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}) {
  const matches = useMatches()

  const teamMatch = matches.find(
    (m) => (m.params as { teamId?: string }).teamId
  )
  const teamId = (teamMatch?.params as { teamId?: string })?.teamId

  const vaultMatch = matches.find(
    (m) => (m.params as { vaultId?: string }).vaultId
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
          {/* Home — always visible */}
          <Link
            to="/"
            onClick={onClose}
            className={`sidebar-nav-item${
              matches[matches.length - 1]?.routeId === '/' ? ' active' : ''
            }`}
            style={{ animation: 'slide-in 300ms ease 0ms both' }}
          >
            <Home className="sidebar-nav-icon" />
            Home
          </Link>

          {/* Vaults & Team — only when inside a team */}
          {teamId && (
            <>
              <Link
                to="/teams/$teamId/vaults"
                params={{ teamId }}
                onClick={onClose}
                className={`sidebar-nav-item${
                  matches.some((m) =>
                    m.fullPath.startsWith('/teams/$teamId/vaults')
                  )
                    ? ' active'
                    : ''
                }`}
                style={{ animation: 'slide-in 300ms ease 50ms both' }}
              >
                <Shield className="sidebar-nav-icon" />
                Vaults
              </Link>
              <Link
                to="/teams/$teamId/team"
                params={{ teamId }}
                onClick={onClose}
                className={`sidebar-nav-item${
                  matches.some((m) =>
                    m.fullPath.startsWith('/teams/$teamId/team')
                  )
                    ? ' active'
                    : ''
                }`}
                style={{ animation: 'slide-in 300ms ease 100ms both' }}
              >
                <Users className="sidebar-nav-icon" />
                Team
              </Link>
            </>
          )}
        </nav>

        {/* ── Current vault ── */}
        {teamId && vaultId && (
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
                to="/teams/$teamId/vaults/$vaultId/proposals/new"
                params={{ teamId: teamId!, vaultId }}
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
