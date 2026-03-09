import { Effect, Layer, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  BootstrapConfigSchema,
  readBootstrapConfig,
  type BootstrapConfig
} from './config'
import {
  buildCreateBadgeResourceManifest,
  buildCreateTeamAccountManifest,
  buildDistributeBadgesManifest,
  deriveSignatureBadgeLocalId
} from './manifests'
import { runBootstrap } from './bootstrap'
import { TransactionService } from './transactionService'

const ED25519_KEY_1 =
  'a6b8bde20a317f0a98e95a0c88b81ec6a1f1f44d79bbdf0a8b6b2b5d3f8c2a1e'
const ED25519_KEY_2 =
  'b7c9cef31b428e1ba9fa6b1d99c92fd7b2e2e55e8acce01b9c7c3c6e4e9d3b2f'
const ED25519_KEY_3 =
  'c8dadf042c539f2cb0a07c2eaad03e8c3f3f66f9bddee12cadbe4d7f5fae4c30'

const VALID_CONFIG = {
  networkId: 2,
  signers: [
    { publicKey: ED25519_KEY_1 },
    { publicKey: ED25519_KEY_2 },
    { publicKey: ED25519_KEY_3 }
  ],
  threshold: 2,
  badgeRecipients: ['account_tdx_2_test1', 'account_tdx_2_test2'],
  badgeName: 'Test Badge'
}

// --- Config validation tests ---

describe('BootstrapConfigSchema', () => {
  it('accepts valid config with defaults', () => {
    const result = Schema.decodeUnknownSync(BootstrapConfigSchema)({
      networkId: 2,
      signers: [{ publicKey: ED25519_KEY_1 }],
      threshold: 1,
      badgeRecipients: ['account_test']
    })
    expect(result.badgeName).toBe('Team Member Badge')
    expect(result.signers[0].keyType).toBe('ed25519')
  })

  it('rejects invalid network ID', () => {
    expect(() =>
      Schema.decodeUnknownSync(BootstrapConfigSchema)({
        ...VALID_CONFIG,
        networkId: 3
      })
    ).toThrow()
  })

  it('rejects empty signers', () => {
    expect(() =>
      Schema.decodeUnknownSync(BootstrapConfigSchema)({
        ...VALID_CONFIG,
        signers: []
      })
    ).toThrow()
  })

  it('rejects invalid public key format', () => {
    expect(() =>
      Schema.decodeUnknownSync(BootstrapConfigSchema)({
        ...VALID_CONFIG,
        signers: [{ publicKey: 'not-hex' }]
      })
    ).toThrow()
  })

  it('rejects threshold of 0', () => {
    expect(() =>
      Schema.decodeUnknownSync(BootstrapConfigSchema)({
        ...VALID_CONFIG,
        threshold: 0
      })
    ).toThrow()
  })
})

describe('readBootstrapConfig', () => {
  it('rejects threshold exceeding signer count', async () => {
    // Write a temp file with invalid threshold
    const fs = await import('node:fs/promises')
    const os = await import('node:os')
    const path = await import('node:path')
    const tmpFile = path.join(os.tmpdir(), 'bootstrap-test-invalid.json')
    await fs.writeFile(
      tmpFile,
      JSON.stringify({ ...VALID_CONFIG, threshold: 10 })
    )

    const result = await Effect.runPromiseExit(readBootstrapConfig(tmpFile))
    expect(result._tag).toBe('Failure')
  })
})

// --- Manifest builder tests ---

describe('deriveSignatureBadgeLocalId', () => {
  it('returns 52 hex characters (26 bytes)', () => {
    const localId = deriveSignatureBadgeLocalId(ED25519_KEY_1)
    expect(localId).toHaveLength(52)
    expect(localId).toMatch(/^[0-9a-f]{52}$/)
  })

  it('is deterministic', () => {
    const id1 = deriveSignatureBadgeLocalId(ED25519_KEY_1)
    const id2 = deriveSignatureBadgeLocalId(ED25519_KEY_1)
    expect(id1).toBe(id2)
  })

  it('produces different IDs for different keys', () => {
    const id1 = deriveSignatureBadgeLocalId(ED25519_KEY_1)
    const id2 = deriveSignatureBadgeLocalId(ED25519_KEY_2)
    expect(id1).not.toBe(id2)
  })
})

describe('buildCreateTeamAccountManifest', () => {
  it('builds a valid manifest with CALL_FUNCTION', () => {
    const manifest = buildCreateTeamAccountManifest({
      feePayerAddress: 'account_tdx_2_feepayer',
      signers: [
        { publicKey: ED25519_KEY_1, keyType: 'ed25519' },
        { publicKey: ED25519_KEY_2, keyType: 'ed25519' }
      ],
      threshold: 2,
      networkId: 2
    })

    expect(manifest).toContain('lock_fee')
    expect(manifest).toContain('CALL_FUNCTION')
    expect(manifest).toContain('"Account"')
    expect(manifest).toContain('"create_advanced"')
    expect(manifest).toContain(
      'resource_tdx_2_1nfxxxxxxxxxxed25sgxxxxxxxxx002236757237xxxxxxxxx3e2cpa'
    )
    expect(manifest).toContain('account_tdx_2_feepayer')
  })

  it('uses AllOf when threshold equals signer count', () => {
    const manifest = buildCreateTeamAccountManifest({
      feePayerAddress: 'account_tdx_2_feepayer',
      signers: [
        { publicKey: ED25519_KEY_1, keyType: 'ed25519' },
        { publicKey: ED25519_KEY_2, keyType: 'ed25519' }
      ],
      threshold: 2,
      networkId: 2
    })

    // AllOf uses Enum<2u8>(Array...) — no count argument
    expect(manifest).not.toContain('2u8,')
  })

  it('uses CountOf when threshold is less than signer count', () => {
    const manifest = buildCreateTeamAccountManifest({
      feePayerAddress: 'account_tdx_2_feepayer',
      signers: [
        { publicKey: ED25519_KEY_1, keyType: 'ed25519' },
        { publicKey: ED25519_KEY_2, keyType: 'ed25519' },
        { publicKey: ED25519_KEY_3, keyType: 'ed25519' }
      ],
      threshold: 2,
      networkId: 2
    })

    expect(manifest).toContain('2u8,')
  })

  it('uses correct resource for mainnet', () => {
    const manifest = buildCreateTeamAccountManifest({
      feePayerAddress: 'account_rdx_feepayer',
      signers: [{ publicKey: ED25519_KEY_1, keyType: 'ed25519' }],
      threshold: 1,
      networkId: 1
    })

    expect(manifest).toContain(
      'resource_rdx1nfxxxxxxxxxxed25sgxxxxxxxxx002236757237xxxxxxxxxed25sg'
    )
    expect(manifest).toContain(
      'package_rdx1pkgxxxxxxxxxaccntxxxxxxxxxx000929625493xxxxxxxxxaccntt'
    )
  })
})

describe('buildCreateBadgeResourceManifest', () => {
  it('builds a manifest with CREATE_FUNGIBLE_RESOURCE_WITH_INITIAL_SUPPLY', () => {
    const manifest = buildCreateBadgeResourceManifest({
      feePayerAddress: 'account_tdx_2_feepayer',
      signers: [
        { publicKey: ED25519_KEY_1, keyType: 'ed25519' },
        { publicKey: ED25519_KEY_2, keyType: 'ed25519' }
      ],
      threshold: 2,
      networkId: 2,
      recipientCount: 3,
      badgeName: 'Test Badge'
    })

    expect(manifest).toContain('CREATE_FUNGIBLE_RESOURCE_WITH_INITIAL_SUPPLY')
    expect(manifest).toContain('Decimal("3")')
    expect(manifest).toContain('"Test Badge"')
    expect(manifest).toContain('try_deposit_batch_or_abort')
  })
})

describe('buildDistributeBadgesManifest', () => {
  it('builds a manifest that withdraws and distributes', () => {
    const manifest = buildDistributeBadgesManifest({
      feePayerAddress: 'account_tdx_2_feepayer',
      badgeResourceAddress: 'resource_tdx_2_badge123',
      recipients: ['account_tdx_2_alice', 'account_tdx_2_bob']
    })

    expect(manifest).toContain('"withdraw"')
    expect(manifest).toContain('Decimal("2")')
    expect(manifest).toContain('account_tdx_2_alice')
    expect(manifest).toContain('account_tdx_2_bob')
    expect(manifest).toContain('Bucket("badge_0")')
    expect(manifest).toContain('Bucket("badge_1")')
    expect(manifest).toContain('try_deposit_or_abort')
  })
})

// --- Bootstrap flow smoke test with mocked TransactionService ---

const makeConfig = (
  overrides: Partial<BootstrapConfig> = {}
): BootstrapConfig =>
  Schema.decodeSync(BootstrapConfigSchema)({
    networkId: 2,
    signers: [{ publicKey: ED25519_KEY_1 }, { publicKey: ED25519_KEY_2 }],
    threshold: 2,
    badgeRecipients: ['account_tdx_2_recipient1'],
    badgeName: 'Test Badge',
    ...overrides
  })

describe('runBootstrap', () => {
  it('orchestrates the full flow and returns addresses', async () => {
    let submitCallCount = 0
    const intentHashes = ['hash_account', 'hash_badge', 'hash_distribute']
    const entitySets: string[][] = [
      ['account_tdx_2_1new_team_account'],
      ['resource_tdx_2_1new_badge_resource'],
      []
    ]

    const MockTransactionService = Layer.succeed(TransactionService, {
      buildAndSubmit: () => {
        const hash = intentHashes[submitCallCount] ?? 'hash_unknown'
        submitCallCount++
        return Effect.succeed({ intentHash: hash })
      },
      pollUntilCommitted: () => Effect.void,
      getCreatedEntities: (intentHash: string) => {
        if (intentHash === 'hash_account') {
          return Effect.succeed(entitySets[0]!)
        }
        if (intentHash === 'hash_badge') {
          return Effect.succeed(entitySets[1]!)
        }
        return Effect.succeed(entitySets[2]!)
      }
    } as unknown as TransactionService)

    const config = makeConfig()

    const result = await Effect.runPromise(
      runBootstrap(config, ED25519_KEY_1).pipe(
        Effect.provide(MockTransactionService)
      )
    )

    expect(result.teamAccountAddress).toBe('account_tdx_2_1new_team_account')
    expect(result.teamMemberBadgeAddress).toBe(
      'resource_tdx_2_1new_badge_resource'
    )
    expect(submitCallCount).toBe(3) // account + badge + distribute
  })

  it('fails if no account address found in receipt', async () => {
    const MockTransactionService = Layer.succeed(TransactionService, {
      buildAndSubmit: () => Effect.succeed({ intentHash: 'hash_test' }),
      pollUntilCommitted: () => Effect.void,
      getCreatedEntities: () => Effect.succeed([])
    } as unknown as TransactionService)

    const config = makeConfig({
      signers: [
        { publicKey: ED25519_KEY_1, keyType: 'ed25519' }
      ] as BootstrapConfig['signers']
    })

    const exit = await Effect.runPromiseExit(
      runBootstrap(config, ED25519_KEY_1).pipe(
        Effect.provide(MockTransactionService)
      )
    )
    expect(exit._tag).toBe('Failure')
  })
})
