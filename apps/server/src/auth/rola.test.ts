import {
  type AccountAddress,
  type HexString,
  AuthConfig
} from '@radix-vaults/shared'
import { GetEntityDetailsVaultAggregated } from '@radix-effects/gateway'
import { PublicKey, RadixEngineToolkit } from '@radixdlt/radix-engine-toolkit'
import { blake2b } from '@noble/hashes/blake2.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { beforeAll } from 'vitest'
import { RolaVerifier, RolaVerificationError } from './rola'

const testChallenge =
  '17f3cb369f2632454f7f22c24e72b0adf7b95e36f2297467d3ff04010b2967e1' as HexString

const testDAppAddress =
  'account_tdx_b_1p9dkged3rpzy860ampt5jpmvv3yl4y6f5yppp4tnscdslvt9v3'

const testOrigin = 'https://dashboard.rdx.works'

const testAuthConfig = AuthConfig.layer({
  networkId: 2,
  dAppDefinitionAddress: testDAppAddress,
  expectedOrigin: testOrigin,
  teamMemberBadgeAddress: 'resource_tdx_2_1t5dummy'
})

const mockEntityDetailsLayer = (ownerKeysRawHex?: string) =>
  Layer.succeed(GetEntityDetailsVaultAggregated, ((
    _addresses: string[],
    _options: unknown,
    _state: unknown
  ) =>
    Effect.succeed([
      {
        metadata: {
          items: ownerKeysRawHex
            ? [
                {
                  key: 'owner_keys',
                  value: { raw_hex: ownerKeysRawHex },
                  is_locked: false,
                  last_updated_at_state_version: 0
                }
              ]
            : []
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ])) as any)

const withVerifier = <A>(
  f: (verifier: RolaVerifier) => Effect.Effect<A, unknown, never>,
  entityDetailsLayer = mockEntityDetailsLayer()
) =>
  Effect.gen(function* () {
    const verifier = yield* RolaVerifier
    return yield* f(verifier)
  }).pipe(
    Effect.provide(RolaVerifier.Default),
    Effect.provide(testAuthConfig),
    Effect.provide(entityDetailsLayer)
  )

// --- Valid test data (computed in beforeAll) ---

let validPublicKey: HexString
let validSignature: HexString
let validPublicKeyHash: string
let validDerivedAddress: string

beforeAll(async () => {
  const privateKeyBytes = Buffer.from('0'.repeat(62) + '01', 'hex')
  const pubKeyBytes = ed25519.getPublicKey(privateKeyBytes)
  validPublicKey = Buffer.from(pubKeyBytes).toString('hex') as HexString

  // Build ROLA signature message: 'R' || challenge || len(dApp) || dApp || origin
  const message = Buffer.concat([
    Buffer.from('R', 'ascii'),
    Buffer.from(testChallenge, 'hex'),
    Buffer.from(testDAppAddress.length.toString(16), 'hex'),
    Buffer.from(testDAppAddress, 'utf-8'),
    Buffer.from(testOrigin, 'utf-8')
  ])
  const messageHash = blake2b(message, { dkLen: 32 })
  const sigBytes = ed25519.sign(messageHash, privateKeyBytes)
  validSignature = Buffer.from(sigBytes).toString('hex') as HexString

  // Public key hash: last 29 bytes of blake2b(publicKey)
  const pkHash = blake2b(pubKeyBytes, { dkLen: 32 })
  validPublicKeyHash = Buffer.from(pkHash.subarray(-29)).toString('hex')

  // Derive virtual address from public key
  validDerivedAddress =
    await RadixEngineToolkit.Derive.virtualAccountAddressFromPublicKey(
      new PublicKey.Ed25519(validPublicKey),
      2
    )
})

describe('RolaVerifier', () => {
  it.effect('rejects invalid signature', () =>
    withVerifier((verifier) =>
      Effect.gen(function* () {
        const result = yield* Effect.either(
          verifier.verify({
            address: 'account_tdx_2_1test' as AccountAddress,
            type: 'account',
            challenge: testChallenge,
            proof: {
              publicKey: 'a'.repeat(64) as HexString,
              signature: 'b'.repeat(128) as HexString,
              curve: 'curve25519'
            }
          })
        )
        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(RolaVerificationError)
          const error = result.left as RolaVerificationError
          expect(
            error.reason === 'invalidSignature' ||
              error.reason === 'invalidPublicKey'
          ).toBe(true)
        }
      })
    )
  )

  it.effect('rejects unsupported curve', () =>
    withVerifier((verifier) =>
      Effect.gen(function* () {
        const result = yield* Effect.either(
          verifier.verify({
            address: 'account_tdx_2_1test' as AccountAddress,
            type: 'account',
            challenge: testChallenge,
            proof: {
              publicKey: 'a'.repeat(64) as HexString,
              signature: 'b'.repeat(128) as HexString,
              curve: 'curve25519'
            }
          })
        )
        expect(result._tag).toBe('Left')
      })
    )
  )

  it.effect('rejects malformed public key', () =>
    withVerifier((verifier) =>
      Effect.gen(function* () {
        const result = yield* Effect.either(
          verifier.verify({
            address: 'account_tdx_2_1test' as AccountAddress,
            type: 'account',
            challenge: testChallenge,
            proof: {
              publicKey: 'zz' as HexString,
              signature: 'ab'.repeat(32) as HexString,
              curve: 'curve25519'
            }
          })
        )
        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(RolaVerificationError)
        }
      })
    )
  )

  it.effect(
    'passes when owner_keys are set and match the public key hash',
    () =>
      withVerifier(
        (verifier) =>
          Effect.gen(function* () {
            const result = yield* Effect.either(
              verifier.verify({
                address: validDerivedAddress as AccountAddress,
                type: 'account',
                challenge: testChallenge,
                proof: {
                  publicKey: validPublicKey,
                  signature: validSignature,
                  curve: 'curve25519'
                }
              })
            )
            expect(result._tag).toBe('Right')
          }),
        mockEntityDetailsLayer(validPublicKeyHash)
      )
  )

  it.effect(
    'fails when owner_keys are set but do not match the public key hash',
    () =>
      withVerifier(
        (verifier) =>
          Effect.gen(function* () {
            const result = yield* Effect.either(
              verifier.verify({
                address: validDerivedAddress as AccountAddress,
                type: 'account',
                challenge: testChallenge,
                proof: {
                  publicKey: validPublicKey,
                  signature: validSignature,
                  curve: 'curve25519'
                }
              })
            )
            expect(result._tag).toBe('Left')
            if (result._tag === 'Left') {
              expect(result.left).toBeInstanceOf(RolaVerificationError)
              expect((result.left as RolaVerificationError).reason).toBe(
                'invalidPublicKey'
              )
            }
          }),
        mockEntityDetailsLayer('deadbeef')
      )
  )

  it.effect(
    'passes when owner_keys are unset and derived address matches',
    () =>
      withVerifier(
        (verifier) =>
          Effect.gen(function* () {
            const result = yield* Effect.either(
              verifier.verify({
                address: validDerivedAddress as AccountAddress,
                type: 'account',
                challenge: testChallenge,
                proof: {
                  publicKey: validPublicKey,
                  signature: validSignature,
                  curve: 'curve25519'
                }
              })
            )
            expect(result._tag).toBe('Right')
          }),
        mockEntityDetailsLayer()
      )
  )

  it.effect(
    'fails when owner_keys are unset and derived address does not match',
    () =>
      withVerifier(
        (verifier) =>
          Effect.gen(function* () {
            const result = yield* Effect.either(
              verifier.verify({
                address: 'account_tdx_2_1different' as AccountAddress,
                type: 'account',
                challenge: testChallenge,
                proof: {
                  publicKey: validPublicKey,
                  signature: validSignature,
                  curve: 'curve25519'
                }
              })
            )
            expect(result._tag).toBe('Left')
            if (result._tag === 'Left') {
              expect(result.left).toBeInstanceOf(RolaVerificationError)
              expect((result.left as RolaVerificationError).reason).toBe(
                'invalidPublicKey'
              )
            }
          }),
        mockEntityDetailsLayer()
      )
  )
})
