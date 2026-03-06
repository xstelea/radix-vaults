import type { SignedChallenge } from '@radix-vaults/shared'
import { AuthConfig } from '@radix-vaults/shared'
import { blake2b } from '@noble/hashes/blake2.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { Data, Effect } from 'effect'

export class RolaVerificationError extends Data.TaggedError(
  'RolaVerificationError'
)<{
  reason: string
}> {}

const createSignatureMessage = (
  challenge: string,
  dAppDefinitionAddress: string,
  origin: string
): Effect.Effect<string, RolaVerificationError> =>
  Effect.try({
    try: () => {
      const prefix = Buffer.from('R', 'ascii')
      const challengeBuffer = Buffer.from(challenge, 'hex')
      const lengthByte = Buffer.from(
        dAppDefinitionAddress.length.toString(16),
        'hex'
      )
      const dAppBuffer = Buffer.from(dAppDefinitionAddress, 'utf-8')
      const originBuffer = Buffer.from(origin, 'utf-8')
      const message = Buffer.concat([
        prefix,
        challengeBuffer,
        lengthByte,
        dAppBuffer,
        originBuffer
      ])
      const hash = blake2b(message, { dkLen: 32 })
      return Buffer.from(hash).toString('hex')
    },
    catch: () => new RolaVerificationError({ reason: 'couldNotHashMessage' })
  })

const hexToBytes = (hex: string) => Buffer.from(hex, 'hex')

const verifySignature = (
  signedChallenge: SignedChallenge,
  signatureMessageHex: string
): Effect.Effect<void, RolaVerificationError> =>
  Effect.try({
    try: () => {
      const { curve, publicKey, signature } = signedChallenge.proof
      const msgBytes = hexToBytes(signatureMessageHex)
      const pubKeyBytes = hexToBytes(publicKey)
      let isValid = false
      if (curve === 'curve25519') {
        isValid = ed25519.verify(hexToBytes(signature), msgBytes, pubKeyBytes)
      } else if (curve === 'secp256k1') {
        isValid = secp256k1.verify(
          hexToBytes(signature.slice(2)),
          msgBytes,
          pubKeyBytes
        )
      }
      if (!isValid) {
        throw new Error('invalid')
      }
    },
    catch: (e) =>
      new RolaVerificationError({
        reason:
          e instanceof Error && e.message === 'invalid'
            ? 'invalidSignature'
            : 'invalidPublicKey'
      })
  })

const createPublicKeyHash = (publicKeyHex: string) =>
  Effect.try({
    try: () => {
      const hash = blake2b(Buffer.from(publicKeyHex, 'hex'), { dkLen: 32 })
      const last29 = hash.subarray(-29)
      return Buffer.from(last29).toString('hex')
    },
    catch: () => new RolaVerificationError({ reason: 'couldNotHashPublicKey' })
  })

export class RolaVerifier extends Effect.Service<RolaVerifier>()(
  '@radix-vaults/server/auth/RolaVerifier',
  {
    effect: Effect.gen(function* () {
      const config = yield* AuthConfig

      const verify = (
        signedChallenge: SignedChallenge
      ): Effect.Effect<void, RolaVerificationError> =>
        Effect.gen(function* () {
          yield* createPublicKeyHash(signedChallenge.proof.publicKey)
          const signatureMessage = yield* createSignatureMessage(
            signedChallenge.challenge,
            config.dAppDefinitionAddress,
            config.expectedOrigin
          )
          yield* verifySignature(signedChallenge, signatureMessage)
          // Gateway owner_keys verification deferred until Gateway
          // integration lands. Signature verification + badge balance
          // check provides the actual authorization gate.
        })

      return { verify } as const
    })
  }
) {}
