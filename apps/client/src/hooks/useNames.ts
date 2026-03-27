import { Result, useAtomValue } from '@effect-atom/atom-react'
import { teamsListAtom } from '@/atom/teams'
import { vaultsListAtom } from '@/atom/vaults'

export function useTeamName(teamId: string): string {
  const teamsResult = useAtomValue(teamsListAtom)
  const teams =
    Result.builder(teamsResult)
      .onSuccess((t) => t)
      .render() ?? []
  return teams.find((t) => t.teamId === teamId)?.name ?? 'Team'
}

export function useVaultName(teamId: string, vaultId: string): string {
  const vaultsResult = useAtomValue(vaultsListAtom(teamId))
  const vaults =
    Result.builder(vaultsResult)
      .onSuccess((v) => v)
      .render() ?? []
  return vaults.find((v) => v.accountAddress === vaultId)?.name ?? 'Vault'
}
