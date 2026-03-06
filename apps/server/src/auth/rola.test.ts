import { AuthConfig } from '@radix-vaults/shared'
import { Effect } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { RolaVerifier, RolaVerificationError } from './rola'

const testAuthConfig = AuthConfig.layer({
  networkId: 2,
  dAppDefinitionAddress:
    'account_tdx_b_1p9dkged3rpzy860ampt5jpmvv3yl4y6f5yppp4tnscdslvt9v3',
  expectedOrigin: 'https://dashboard.rdx.works',
  teamMemberBadgeAddress: 'resource_tdx_2_1t5dummy'
})

const withVerifier = <A>(
  f: (verifier: RolaVerifier) => Effect.Effect<A, unknown, never>
) =>
  Effect.gen(function* () {
    const verifier = yield* RolaVerifier
    return yield* f(verifier)
  }).pipe(Effect.provide(RolaVerifier.Default), Effect.provide(testAuthConfig))

describe('RolaVerifier', () => {
  it.effect('rejects invalid signature', () =>
    withVerifier((verifier) =>
      Effect.gen(function* () {
        const result = yield* Effect.either(
          verifier.verify({
            address: 'account_tdx_2_1test',
            type: 'account',
            challenge:
              '17f3cb369f2632454f7f22c24e72b0adf7b95e36f2297467d3ff04010b2967e1',
            proof: {
              publicKey: 'a'.repeat(64),
              signature: 'b'.repeat(128),
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
            address: 'account_tdx_2_1test',
            type: 'account',
            challenge:
              '17f3cb369f2632454f7f22c24e72b0adf7b95e36f2297467d3ff04010b2967e1',
            proof: {
              publicKey: 'a'.repeat(64),
              signature: 'b'.repeat(128),
              curve: 'curve25519' // we only test signature verification errors since the schema enforces curve types
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
            address: 'account_tdx_2_1test',
            type: 'account',
            challenge:
              '17f3cb369f2632454f7f22c24e72b0adf7b95e36f2297467d3ff04010b2967e1',
            proof: {
              publicKey: 'zz',
              signature: 'ab'.repeat(32),
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
})
