import { useState, useEffect, useCallback } from 'react'
import { Link, useMatches } from '@tanstack/react-router'
import { Result, useAtomValue } from '@effect-atom/atom-react'
import { Users, FileText, X, Shield, ChevronRight, Plus } from 'lucide-react'
import { sessionAtom } from '@/atom/auth'
import { teamsListAtom } from '@/atom/teams'
import { vaultsListAtom } from '@/atom/vaults'

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

  const teamsResult = useAtomValue(teamsListAtom)

  const vaultMatch = matches.find(
    (m) => (m.params as { vaultId?: string }).vaultId
  )
  const vaultId = (vaultMatch?.params as { vaultId?: string })?.vaultId

  const sessionResult = useAtomValue(sessionAtom)
  const session = Result.builder(sessionResult)
    .onInitialOrWaiting(() => null)
    .onFailure(() => null)
    .onSuccess((s) => s)
    .render()

  const teams =
    Result.builder(teamsResult)
      .onSuccess((t) => t)
      .render() ?? []

  // ── Expand/collapse state (independent of navigation) ──
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [expandedVaults, setExpandedVaults] = useState<Set<string>>(new Set())

  // Auto-expand the active team + its vaults on route change
  useEffect(() => {
    if (teamId) {
      setExpandedTeams((prev) => {
        if (prev.has(teamId)) return prev
        const next = new Set(prev)
        next.add(teamId)
        return next
      })
      setExpandedVaults((prev) => {
        if (prev.has(teamId)) return prev
        const next = new Set(prev)
        next.add(teamId)
        return next
      })
    }
  }, [teamId])

  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  const toggleTeam = useCallback((id: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleVaults = useCallback((id: string) => {
    setExpandedVaults((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={onClose}
          role="presentation"
        />
      )}

      <aside
        className={`sidebar fixed z-50 lg:sticky lg:top-0 lg:translate-x-0 transition-transform ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* ── Logo ── */}
        <div className="flex items-center justify-between h-16 px-5">
          <Link to="/" className="flex items-center gap-3" onClick={onClose}>
            <Shield
              className="h-6 w-6 text-safe-green"
              style={{
                filter: 'drop-shadow(0 0 8px oklch(0.55 0.17 155 / 0.4))',
                animation: 'shimmer 3s ease-in-out infinite'
              }}
            />
            <span
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '15px',
                fontWeight: 500,
                color: 'oklch(0.85 0.01 55)',
                letterSpacing: '0.05em'
              }}
            >
              Radix Vaults
            </span>
          </Link>
          <button
            className="lg:hidden p-2 rounded-md hover:bg-white/10 transition-colors"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" style={{ color: 'oklch(0.55 0.01 55)' }} />
          </button>
        </div>

        {/* ── Separator ── */}
        <div
          className="mx-5 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, oklch(0.24 0.015 55), transparent)'
          }}
        />

        {/* ── Network badge ── */}
        <div className="flex items-center gap-2.5 px-5 py-3.5">
          <span
            className="h-1.5 w-1.5 rounded-full bg-safe-green"
            style={{ animation: 'pulse-dot 2s ease-in-out infinite' }}
          />
          <span
            className="text-[10px] font-semibold uppercase"
            style={{ color: 'oklch(0.55 0.015 55)', letterSpacing: '0.1em' }}
          >
            Stokenet
          </span>
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto">
          {teams.length > 0 && (
            <>
              {/* ── "My teams" clickable header → home ── */}
              <Link
                to="/"
                onClick={onClose}
                className={`sidebar-section-label sidebar-section-link${
                  matches.length === 1 && matches[0]?.fullPath === '/'
                    ? ' active'
                    : ''
                }`}
              >
                My teams
              </Link>
              <div
                className="mx-2 mb-1 h-px"
                style={{
                  background:
                    'linear-gradient(90deg, oklch(0.22 0.015 55), transparent)'
                }}
              />

              {/* ── Team list ── */}
              {teams.map((team) => {
                const isExpanded = expandedTeams.has(team.teamId)
                const isActiveTeam = teamId === team.teamId
                const isVaultsExpanded = expandedVaults.has(team.teamId)
                const isVaultsActive =
                  isActiveTeam &&
                  matches.some((m) =>
                    m.fullPath.startsWith('/teams/$teamId/vaults')
                  )
                const isMembersActive =
                  isActiveTeam &&
                  matches.some((m) =>
                    m.fullPath.startsWith('/teams/$teamId/team')
                  )

                return (
                  <div key={team.teamId} className="sidebar-team-group">
                    {/* Team row */}
                    <div
                      className={`sidebar-row sidebar-row--team${isActiveTeam ? ' active' : ''}`}
                    >
                      <button
                        type="button"
                        className="sidebar-chevron-area"
                        onClick={() => toggleTeam(team.teamId)}
                        aria-expanded={isExpanded}
                        aria-label={
                          isExpanded
                            ? `Collapse ${team.name}`
                            : `Expand ${team.name}`
                        }
                      >
                        <ChevronRight
                          className={`sidebar-chevron${isExpanded ? ' expanded' : ''}`}
                        />
                      </button>
                      <Link
                        to="/teams/$teamId"
                        params={{ teamId: team.teamId }}
                        onClick={onClose}
                        className="sidebar-row-link"
                      >
                        <Users className="sidebar-icon" />
                        <span className="truncate">{team.name}</span>
                      </Link>
                    </div>

                    {/* Team children */}
                    {isExpanded && (
                      <div
                        className={`sidebar-children${isActiveTeam ? ' active' : ''}`}
                      >
                        {/* Members */}
                        <Link
                          to="/teams/$teamId/team"
                          params={{ teamId: team.teamId }}
                          onClick={onClose}
                          className={`sidebar-row sidebar-row--child sidebar-row--leaf${isMembersActive ? ' active' : ''}`}
                        >
                          Members
                        </Link>

                        {/* Vaults (collapsible) */}
                        <div
                          className={`sidebar-row sidebar-row--child${isVaultsActive ? ' active' : ''}`}
                        >
                          <button
                            type="button"
                            className="sidebar-chevron-area"
                            onClick={() => toggleVaults(team.teamId)}
                            aria-expanded={isVaultsExpanded}
                            aria-label={
                              isVaultsExpanded
                                ? 'Collapse vaults'
                                : 'Expand vaults'
                            }
                          >
                            <ChevronRight
                              className={`sidebar-chevron${isVaultsExpanded ? ' expanded' : ''}`}
                            />
                          </button>
                          <Link
                            to="/teams/$teamId/vaults"
                            params={{ teamId: team.teamId }}
                            onClick={onClose}
                            className="sidebar-row-link"
                          >
                            Vaults
                          </Link>
                        </div>

                        {isVaultsExpanded && (
                          <div
                            className={`sidebar-children sidebar-children--deep${isVaultsActive ? ' active' : ''}`}
                          >
                            <TeamVaults
                              teamId={team.teamId}
                              activeVaultId={isActiveTeam ? vaultId : undefined}
                              onClose={onClose}
                            />
                            {session && (
                              <Link
                                to="/teams/$teamId/vaults/create"
                                params={{ teamId: team.teamId }}
                                onClick={onClose}
                                className={`sidebar-row sidebar-row--vault${
                                  isActiveTeam &&
                                  matches.some(
                                    (m) =>
                                      m.fullPath ===
                                      '/teams/$teamId/vaults/create'
                                  )
                                    ? ' active'
                                    : ''
                                }`}
                              >
                                <Plus className="sidebar-icon" />
                                <span>Create vault</span>
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Create team */}
              {session && (
                <Link
                  to="/teams/create"
                  onClick={onClose}
                  className={`sidebar-row sidebar-row--team${
                    matches.some((m) => m.fullPath === '/teams/create')
                      ? ' active'
                      : ''
                  }`}
                >
                  <Plus className="sidebar-icon" />
                  Create team
                </Link>
              )}
            </>
          )}
        </nav>

        {/* ── Current vault ── */}
        {teamId && vaultId && (
          <CurrentVaultCard
            teamId={teamId}
            vaultId={vaultId}
            session={session}
            onClose={onClose}
          />
        )}
      </aside>
    </>
  )
}

function CurrentVaultCard({
  teamId,
  vaultId,
  session,
  onClose
}: {
  teamId: string
  vaultId: string
  session: boolean | object | null
  onClose: () => void
}) {
  const vaultsResult = useAtomValue(vaultsListAtom(teamId))
  const vaults =
    Result.builder(vaultsResult)
      .onSuccess((v) => v)
      .render() ?? []

  const vault = vaults.find((v) => v.accountAddress === vaultId)
  const vaultName =
    vault?.name ?? vaultId.slice(0, 12) + '...' + vaultId.slice(-8)

  return (
    <div className="px-3 pb-4">
      <div className="vault-card space-y-3">
        <div>
          <p
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'oklch(0.45 0.015 55)' }}
          >
            Current Vault
          </p>
          <p
            className="mt-1.5 text-sm font-medium truncate"
            style={{ color: 'oklch(0.87 0.01 55)' }}
          >
            {vaultName}
          </p>
          <p
            className="text-[11px] font-mono truncate"
            style={{ color: 'oklch(0.42 0.03 145)' }}
          >
            {vaultId.slice(0, 12)}...{vaultId.slice(-8)}
          </p>
        </div>
        {session && (
          <Link
            to="/teams/$teamId/vaults/$vaultId/proposals/new"
            params={{ teamId, vaultId }}
            onClick={onClose}
            className="vault-card-btn"
          >
            <FileText className="h-3.5 w-3.5" />
            New Proposal
          </Link>
        )}
      </div>
    </div>
  )
}

function TeamVaults({
  teamId,
  activeVaultId,
  onClose
}: {
  teamId: string
  activeVaultId: string | undefined
  onClose: () => void
}) {
  const vaultsResult = useAtomValue(vaultsListAtom(teamId))
  const vaults =
    Result.builder(vaultsResult)
      .onSuccess((v) => v)
      .render() ?? []

  if (vaults.length === 0) return null

  return (
    <>
      {vaults.map((vault) => (
        <Link
          key={vault.accountAddress}
          to="/teams/$teamId/vaults/$vaultId"
          params={{ teamId, vaultId: vault.accountAddress }}
          onClick={onClose}
          className={`sidebar-row sidebar-row--vault${
            activeVaultId === vault.accountAddress ? ' active' : ''
          }`}
        >
          <span className="truncate">{vault.name}</span>
        </Link>
      ))}
    </>
  )
}
