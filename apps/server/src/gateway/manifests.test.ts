import { describe, expect, it } from 'vitest'
import {
  buildAddMemberManifest,
  buildChangeThresholdManifest,
  buildCreateTeamBadgeManifest,
  buildRemoveMemberManifest
} from './manifests'

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

    // 1-of-1 = Require (Enum<0u8>) wrapping ResourceOrNonFungible::NonFungible (Enum<0u8>)
    // NOT CountOf or AllOf with an array
    expect(manifest).toContain(
      'Enum<0u8>(\n' +
        '                    Enum<0u8>(\n' +
        '                        NonFungibleGlobalId('
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

describe('buildAddMemberManifest', () => {
  it('mints NFT with 3-field tuple matching on-ledger schema', async () => {
    const manifest = await buildAddMemberManifest({
      badgeResource: 'resource_tdx_2_badge_res',
      recipientAccount: 'account_tdx_2_recipient',
      name: 'NewMember',
      teamId: 'team-uuid-123',
      virtualBadge:
        'resource_tdx_2_1nfxxxxxxxxxxed25sgxxxxxxxxx002236757237xxxxxxxxx3e2cpa:[abcdef]',
      badgeRoleEntry: {
        entityAddress: 'resource_tdx_2_badge_res',
        signers: [
          {
            resourceAddress:
              'resource_tdx_2_1nfxxxxxxxxxxed25519_xxxxxxxxxxxxxxxxxxxx',
            localId: '[aaa111]'
          }
        ],
        threshold: 1
      },
      vaultRoleEntries: [],
      networkId: 2
    })

    expect(manifest).toContain('MINT_NON_FUNGIBLE')
    expect(manifest).toContain('"NewMember"')
    expect(manifest).toContain('"team-uuid-123"')
    // All 3 fields in order: name, teamId, virtualBadge
    expect(manifest).toMatch(/"NewMember", "team-uuid-123", "resource_tdx_2/)
  })
})

const ed25519Signer = (localId: string) => ({
  resourceAddress: 'resource_tdx_2_1nfxxxxxxxxxxed25519_xxxxxxxxxxxxxxxxxxxx',
  localId: `[${localId}]`
})

const secp256k1Signer = (localId: string) => ({
  resourceAddress: 'resource_tdx_2_1nfxxxxxxxxxxscp256k1_xxxxxxxxxxxxxxxxxxxx',
  localId: `[${localId}]`
})

describe('buildRemoveMemberManifest', () => {
  it('recalls NFT from member vault, burns it, and sets owner role on badge + vaults', async () => {
    const manifest = await buildRemoveMemberManifest({
      badgeResource: 'resource_tdx_2_badge_res',
      memberInternalVaultAddress: 'internal_vault_tdx_2_member_vault',
      nftLocalId: '[deadbeef1234]',
      badgeRoleEntry: {
        entityAddress: 'resource_tdx_2_badge_res',
        signers: [ed25519Signer('aaa111'), ed25519Signer('bbb222')],
        threshold: 2
      },
      vaultRoleEntries: [
        {
          entityAddress: 'account_tdx_2_vault1',
          signers: [ed25519Signer('aaa111'), ed25519Signer('bbb222')],
          threshold: 1
        }
      ],
      networkId: 2
    })

    // Core instructions: recall → burn
    expect(manifest).toContain('RECALL_NON_FUNGIBLES_FROM_VAULT')
    expect(manifest).toContain('internal_vault_tdx_2_member_vault')
    expect(manifest).toContain('[deadbeef1234]')
    expect(manifest).toContain('TAKE_ALL_FROM_WORKTOP')
    expect(manifest).toContain('BURN_RESOURCE')

    // SET_OWNER_ROLE for badge resource AND vault
    const setOwnerMatches = manifest.match(/SET_OWNER_ROLE/g)
    expect(setOwnerMatches).toHaveLength(2)
    expect(manifest).toContain('resource_tdx_2_badge_res')
    expect(manifest).toContain('account_tdx_2_vault1')

    // Both remaining signers referenced in the access rules
    expect(manifest).toContain('aaa111')
    expect(manifest).toContain('bbb222')
  })

  it('uses AllOf access rule when threshold equals signer count', async () => {
    const manifest = await buildRemoveMemberManifest({
      badgeResource: 'resource_tdx_2_badge_res',
      memberInternalVaultAddress: 'internal_vault_tdx_2_member_vault',
      nftLocalId: '[deadbeef]',
      badgeRoleEntry: {
        entityAddress: 'resource_tdx_2_badge_res',
        signers: [ed25519Signer('aaa111')],
        threshold: 1
      },
      vaultRoleEntries: [],
      networkId: 2
    })

    // AllOf = Enum<3u8> when threshold == count
    expect(manifest).toContain('Enum<3u8>')
    // Should NOT have CountOf (Enum<2u8>) inside access rule
    // There's a top-level Enum<2u8> in the SET_OWNER_ROLE wrapper, but not CountOf with a number
    expect(manifest).not.toMatch(/\d+u8,\s*\n\s*Array<Enum>/)
  })
})

describe('buildChangeThresholdManifest', () => {
  it('produces a single SET_OWNER_ROLE for the vault address', async () => {
    const manifest = await buildChangeThresholdManifest({
      vaultAddress: 'account_tdx_2_target_vault',
      signers: [ed25519Signer('sig1'), secp256k1Signer('sig2')],
      threshold: 1,
      networkId: 2
    })

    // Single SET_OWNER_ROLE
    const setOwnerMatches = manifest.match(/SET_OWNER_ROLE/g)
    expect(setOwnerMatches).toHaveLength(1)
    expect(manifest).toContain('account_tdx_2_target_vault')

    // CountOf (1-of-2) = Enum<2u8> with threshold
    expect(manifest).toContain('1u8')
    expect(manifest).toContain('sig1')
    expect(manifest).toContain('sig2')
  })

  it('does not touch badge resource — only the vault', async () => {
    const manifest = await buildChangeThresholdManifest({
      vaultAddress: 'account_tdx_2_vault_only',
      signers: [ed25519Signer('aaa')],
      threshold: 1,
      networkId: 2
    })

    // No MINT, RECALL, BURN, or badge-related instructions
    expect(manifest).not.toContain('MINT')
    expect(manifest).not.toContain('RECALL')
    expect(manifest).not.toContain('BURN')
    expect(manifest).not.toContain('ALLOCATE_GLOBAL_ADDRESS')

    // Only vault address present
    expect(manifest).toContain('account_tdx_2_vault_only')
  })
})
