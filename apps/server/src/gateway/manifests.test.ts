import { describe, expect, it } from 'vitest'
import { buildCreateTeamBadgeManifest } from './manifests'

describe('buildCreateTeamBadgeManifest', () => {
  it('creates NFT resource with 3-field schema and distributes to creator', async () => {
    const manifest = await buildCreateTeamBadgeManifest({
      feePayerAddress: 'account_tdx_2_feepayer',
      creatorVirtualBadge:
        'resource_tdx_2_1nfxxxxxxxxxxsgnvbdge_ed25sg:[abcdef1234567890]',
      creatorAccount: 'account_tdx_2_creator',
      memberName: 'Alice',
      teamId: 'test-team-uuid',
      networkId: 2
    })

    // Core instructions
    expect(manifest).toContain('lock_fee')
    expect(manifest).toContain('ALLOCATE_GLOBAL_ADDRESS')
    expect(manifest).toContain('NonFungibleResourceManager')
    expect(manifest).toContain(
      'CREATE_NON_FUNGIBLE_RESOURCE_WITH_INITIAL_SUPPLY'
    )
    expect(manifest).toContain('CALL_ROLE_ASSIGNMENT_METHOD')
    expect(manifest).toContain('"set_owner"')

    // Distribution: deposit to fee payer then withdraw to creator
    expect(manifest).toContain('try_deposit_batch_or_abort')
    expect(manifest).toContain('"withdraw_non_fungibles"')
    expect(manifest).toContain('account_tdx_2_creator')

    // 3-field NFT schema field names
    expect(manifest).toContain('"name"')
    expect(manifest).toContain('"teamId"')
    expect(manifest).toContain('"mfa_virtual_resource"')

    // NFT data includes all 3 values
    expect(manifest).toContain('"Alice"')
    expect(manifest).toContain('"test-team-uuid"')

    // Access rule references the creator's virtual badge
    expect(manifest).toContain('abcdef1234567890')
  })

  it('uses 1-of-1 access rule (single creator)', async () => {
    const manifest = await buildCreateTeamBadgeManifest({
      feePayerAddress: 'account_tdx_2_feepayer',
      creatorVirtualBadge:
        'resource_tdx_2_1nfxxxxxxxxxxsgnvbdge_ed25sg:[aabbccdd]',
      creatorAccount: 'account_tdx_2_creator',
      memberName: 'Bob',
      teamId: 'team-123',
      networkId: 2
    })

    // 1-of-1 = Require (Enum<0u8>) wrapping a single NonFungibleGlobalId
    // NOT CountOf or AllOf with an array
    expect(manifest).toContain(
      'Enum<0u8>(\n' + '                    NonFungibleGlobalId('
    )
  })

  it('includes 3 WellKnown(12) entries in the SBOR type schema', async () => {
    const manifest = await buildCreateTeamBadgeManifest({
      feePayerAddress: 'account_tdx_2_feepayer',
      creatorVirtualBadge:
        'resource_tdx_2_1nfxxxxxxxxxxsgnvbdge_ed25sg:[aabbccdd]',
      creatorAccount: 'account_tdx_2_creator',
      memberName: 'Carol',
      teamId: 'team-456',
      networkId: 2
    })

    // Count occurrences of WellKnown(12) = Enum<0u8>(12u8) in the type_kinds array
    const wellKnownMatches = manifest.match(/Enum<0u8>\(12u8\)/g)
    expect(wellKnownMatches).toHaveLength(3)
  })
})
