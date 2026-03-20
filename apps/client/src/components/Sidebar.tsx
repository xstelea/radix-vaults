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

  const activeExpandedTeamId = teamId

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
        <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto">
          {/* ── My Teams ── */}
          {teams.length > 0 && (
            <>
              <div className="sidebar-section-label">My teams</div>
              <div
                className="mx-2 mb-1 h-px"
                style={{
                  background:
                    'linear-gradient(90deg, oklch(0.25 0.01 155), transparent)'
                }}
              />
              {teams.map((team) => {
                const isExpanded = activeExpandedTeamId === team.teamId
                const isActiveTeam = teamId === team.teamId
                return (
                  <div
                    key={team.teamId}
                    className={
                      isExpanded
                        ? 'sidebar-team-group expanded'
                        : 'sidebar-team-group'
                    }
                  >
                    <Link
                      to="/teams/$teamId"
                      params={{ teamId: team.teamId }}
                      onClick={onClose}
                      className={`sidebar-nav-item sidebar-team-toggle${
                        isActiveTeam ? ' active' : ''
                      }`}
                    >
                      <ChevronRight
                        className={`sidebar-nav-icon sidebar-chevron${
                          isExpanded ? ' expanded' : ''
                        }`}
                      />
                      <Users className="sidebar-nav-icon" />
                      <span className="truncate">{team.name}</span>
                    </Link>
                    {isExpanded && (
                      <>
                        <Link
                          to="/teams/$teamId/vaults"
                          params={{ teamId: team.teamId }}
                          onClick={onClose}
                          className={`sidebar-nav-item sidebar-nav-nested${
                            isActiveTeam &&
                            matches.some((m) =>
                              m.fullPath.startsWith('/teams/$teamId/vaults')
                            )
                              ? ' active'
                              : ''
                          }`}
                        >
                          Vaults
                        </Link>
                        <TeamVaults
                          teamId={team.teamId}
                          activeVaultId={isActiveTeam ? vaultId : undefined}
                          onClose={onClose}
                        />
                        <Link
                          to="/teams/$teamId/team"
                          params={{ teamId: team.teamId }}
                          onClick={onClose}
                          className={`sidebar-nav-item sidebar-nav-nested${
                            isActiveTeam &&
                            matches.some((m) =>
                              m.fullPath.startsWith('/teams/$teamId/team')
                            )
                              ? ' active'
                              : ''
                          }`}
                        >
                          Members
                        </Link>
                      </>
                    )}
                  </div>
                )
              })}
              {session && (
                <Link
                  to="/teams/create"
                  onClick={onClose}
                  className={`sidebar-nav-item${
                    matches.some((m) => m.fullPath === '/teams/create')
                      ? ' active'
                      : ''
                  }`}
                >
                  <Plus className="sidebar-nav-icon" />
                  Create team
                </Link>
              )}
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
              {session && (
                <Link
                  to="/teams/$teamId/vaults/$vaultId/proposals/new"
                  params={{ teamId: teamId!, vaultId }}
                  onClick={onClose}
                  className="vault-card-btn"
                >
                  <FileText className="h-3.5 w-3.5" />
                  New Proposal
                </Link>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
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
          className={`sidebar-nav-item sidebar-nav-vault${
            activeVaultId === vault.accountAddress ? ' active' : ''
          }`}
        >
          <span className="truncate">{vault.name}</span>
        </Link>
      ))}
    </>
  )
}
