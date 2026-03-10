import assert from 'node:assert'
import { GatewayApiClient } from '@radix-effects/gateway'
import {
  CompileTransaction,
  CreateTransactionIntent,
  IntentHashService,
  Signer,
  SubmitTransaction,
  TransactionStatus
} from '@radix-effects/tx-tool'
import { Effect, Layer, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { runBootstrap } from './bootstrap'
import {
  BootstrapConfigSchema,
  readBootstrapConfig,
  type BootstrapConfig
} from './config'
import {
  buildCreateBadgeResourceManifest,
  buildCreateTeamAccountManifest,
  deriveSignatureBadgeLocalId
} from './manifests'

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
    const signer = result.signers[0]
    assert('keyType' in signer)
    expect(signer.keyType).toBe('ed25519')
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
  it('builds a valid manifest with CALL_FUNCTION', async () => {
    const manifest = await buildCreateTeamAccountManifest({
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
    expect(manifest).toContain('resource_tdx_2_')
    expect(manifest).toContain('ed25sg')
    expect(manifest).toContain('account_tdx_2_feepayer')
  })

  it('uses AllOf when threshold equals signer count', async () => {
    const manifest = await buildCreateTeamAccountManifest({
      feePayerAddress: 'account_tdx_2_feepayer',
      signers: [
        { publicKey: ED25519_KEY_1, keyType: 'ed25519' },
        { publicKey: ED25519_KEY_2, keyType: 'ed25519' }
      ],
      threshold: 2,
      networkId: 2
    })

    // Protected(BasicRequirement(AllOf(entries)))
    // Enum<0u8> wraps BasicRequirement, Enum<3u8> is AllOf
    expect(manifest).toContain('Enum<3u8>')
    // Entries are ResourceOrNonFungible::NonFungible — single Enum<0u8>(NFG), not double-wrapped
    expect(manifest).not.toMatch(
      /Enum<0u8>\(\s*Enum<0u8>\(\s*NonFungibleGlobalId/
    )
  })

  it('uses CountOf when threshold is less than signer count', async () => {
    const manifest = await buildCreateTeamAccountManifest({
      feePayerAddress: 'account_tdx_2_feepayer',
      signers: [
        { publicKey: ED25519_KEY_1, keyType: 'ed25519' },
        { publicKey: ED25519_KEY_2, keyType: 'ed25519' },
        { publicKey: ED25519_KEY_3, keyType: 'ed25519' }
      ],
      threshold: 2,
      networkId: 2
    })

    // Protected(BasicRequirement(CountOf(2, entries)))
    // Enum<0u8> wraps BasicRequirement, followed by Enum<2u8> for CountOf with threshold arg
    expect(manifest).toContain('2u8,')
    expect(manifest).toMatch(/Enum<0u8>\(\s*Enum<2u8>\(\s*2u8,/)
    // Entries should be ResourceOrNonFungible::NonFungible, not double-wrapped
    expect(manifest).not.toMatch(
      /Enum<0u8>\(\s*Enum<0u8>\(\s*NonFungibleGlobalId/
    )
  })

  it('uses correct resource for mainnet', async () => {
    const manifest = await buildCreateTeamAccountManifest({
      feePayerAddress: 'account_rdx_feepayer',
      signers: [{ publicKey: ED25519_KEY_1, keyType: 'ed25519' }],
      threshold: 1,
      networkId: 1
    })

    expect(manifest).toContain('resource_rdx1nf')
    expect(manifest).toContain('ed25sg')
    expect(manifest).toContain('package_rdx1pkg')
    expect(manifest).toContain('accnt')
  })
})

describe('buildCreateBadgeResourceManifest', () => {
  it('creates resource and distributes in a single manifest', async () => {
    const manifest = await buildCreateBadgeResourceManifest({
      feePayerAddress: 'account_tdx_2_feepayer',
      signers: [
        { publicKey: ED25519_KEY_1, keyType: 'ed25519' },
        { publicKey: ED25519_KEY_2, keyType: 'ed25519' }
      ],
      threshold: 2,
      networkId: 2,
      recipients: [
        'account_tdx_2_alice',
        'account_tdx_2_bob',
        'account_tdx_2_carol'
      ],
      badgeName: 'Test Badge'
    })

    expect(manifest).toContain('ALLOCATE_GLOBAL_ADDRESS')
    expect(manifest).toContain('FungibleResourceManager')
    expect(manifest).toContain('CREATE_FUNGIBLE_RESOURCE_WITH_INITIAL_SUPPLY')
    expect(manifest).toContain('AddressReservation("badge_reservation")')
    expect(manifest).toContain('Decimal("3")')
    expect(manifest).toContain('"Test Badge"')
    expect(manifest).toContain('NamedAddress("badge_address")')
    expect(manifest).toContain('account_tdx_2_alice')
    expect(manifest).toContain('account_tdx_2_bob')
    expect(manifest).toContain('account_tdx_2_carol')
    expect(manifest).toContain('"withdraw"')
    expect(manifest).toContain('try_deposit_batch_or_abort')
  })
})

// --- Bootstrap flow smoke test with mocked tx-tool services ---

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

const makeMockTxLayer = (entitySets: Record<string, string[]>) => {
  let txCallCount = 0
  const intentIds = ['hash_account', 'hash_badge']

  return Layer.mergeAll(
    Layer.succeed(CreateTransactionIntent, (() =>
      Effect.succeed({
        header: { notaryIsSignatory: false },
        message: { kind: 'None' as const },
        manifest: {
          instructions: { kind: 'String' as const, value: '' },
          blobs: [] as Uint8Array[]
        }
      })) as unknown as CreateTransactionIntent),

    Layer.succeed(IntentHashService, {
      create: () => {
        const id = intentIds[txCallCount] ?? 'hash_unknown'
        txCallCount++
        return Effect.succeed({ id, hash: 'deadbeef' })
      }
    } as unknown as IntentHashService),

    Layer.succeed(Signer, {
      signToSignatureWithPublicKey: () => Effect.succeed([] as any),
      publicKey: () => Effect.succeed({} as any)
    }),

    Layer.succeed(CompileTransaction, (() =>
      Effect.succeed(
        new Uint8Array([1, 2, 3])
      )) as unknown as CompileTransaction),

    Layer.succeed(SubmitTransaction, (() =>
      Effect.succeed({ duplicate: false })) as unknown as SubmitTransaction),

    Layer.succeed(TransactionStatus, {
      poll: () => Effect.succeed({})
    } as unknown as TransactionStatus),

    Layer.succeed(GatewayApiClient, {
      transaction: {
        getCommittedDetails: (id: string) =>
          Effect.succeed({
            transaction: {
              affected_global_entities: entitySets[id] ?? []
            }
          })
      }
    } as unknown as GatewayApiClient)
  )
}

describe('runBootstrap', () => {
  it('orchestrates the full flow and returns addresses', async () => {
    const layer = makeMockTxLayer({
      hash_account: ['account_tdx_2_1new_team_account'],
      hash_badge: ['resource_tdx_2_1new_badge_resource']
    })

    const config = makeConfig()

    const result = await Effect.runPromise(
      runBootstrap(config, 'account_tdx_2_feepayer').pipe(Effect.provide(layer))
    )

    expect(result.teamAccountAddress).toBe('account_tdx_2_1new_team_account')
    expect(result.teamMemberBadgeAddress).toBe(
      'resource_tdx_2_1new_badge_resource'
    )
  })

  it('fails if no account address found in receipt', async () => {
    const layer = makeMockTxLayer({})

    const config = makeConfig({
      signers: [
        { publicKey: ED25519_KEY_1, keyType: 'ed25519' }
      ] as BootstrapConfig['signers']
    })

    const exit = await Effect.runPromiseExit(
      runBootstrap(config, 'account_tdx_2_feepayer').pipe(Effect.provide(layer))
    )
    expect(exit._tag).toBe('Failure')
  })
})
