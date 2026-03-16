import type { HexString, SignedChallenge } from '@radix-vaults/shared'
import { AuthConfig } from '@radix-vaults/shared'
import { GetEntityDetailsVaultAggregated } from '@radix-effects/gateway'
import { PublicKey, RadixEngineToolkit } from '@radixdlt/radix-engine-toolkit'
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
  challenge: HexString,
  dAppDefinitionAddress: string,
  origin: string
): Effect.Effect<HexString, RolaVerificationError> =>
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
      return Buffer.from(hash).toString('hex') as HexString
    },
    catch: () => new RolaVerificationError({ reason: 'couldNotHashMessage' })
  })

const hexToBytes = (hex: HexString) => Buffer.from(hex, 'hex')

const verifySignature = (
  signedChallenge: SignedChallenge,
  signatureMessageHex: HexString
): Effect.Effect<void, RolaVerificationError> =>
  Effect.gen(function* () {
    const { curve, publicKey, signature } = signedChallenge.proof
    const msgBytes = hexToBytes(signatureMessageHex)
    const pubKeyBytes = hexToBytes(publicKey)

    const isValid = yield* Effect.try({
      try: () => {
        if (curve === 'curve25519')
          return ed25519.verify(hexToBytes(signature), msgBytes, pubKeyBytes)
        if (curve === 'secp256k1')
          return secp256k1.verify(
            hexToBytes(signature.slice(2) as HexString),
            msgBytes,
            pubKeyBytes
          )
        return false
      },
      catch: () => new RolaVerificationError({ reason: 'invalidPublicKey' })
    })

    if (!isValid)
      yield* Effect.fail(
        new RolaVerificationError({ reason: 'invalidSignature' })
      )
  })

const createPublicKeyHash = (publicKeyHex: HexString) =>
  Effect.try({
    try: () => {
      const hash = blake2b(Buffer.from(publicKeyHex, 'hex'), { dkLen: 32 })
      const last29 = hash.subarray(-29)
      return Buffer.from(last29).toString('hex') as HexString
    },
    catch: () => new RolaVerificationError({ reason: 'couldNotHashPublicKey' })
  })

const deriveVirtualAddress = (
  signedChallenge: SignedChallenge,
  networkId: number
): Effect.Effect<string, RolaVerificationError> =>
  Effect.tryPromise({
    try: () => {
      const { publicKey, curve } = signedChallenge.proof
      if (signedChallenge.type === 'persona')
        return RadixEngineToolkit.Derive.virtualIdentityAddressFromPublicKey(
          new PublicKey.Ed25519(publicKey),
          networkId
        )
      if (curve === 'curve25519')
        return RadixEngineToolkit.Derive.virtualAccountAddressFromPublicKey(
          new PublicKey.Ed25519(publicKey),
          networkId
        )
      if (curve === 'secp256k1')
        return RadixEngineToolkit.Derive.virtualAccountAddressFromPublicKey(
          new PublicKey.Secp256k1(publicKey),
          networkId
        )
      return Promise.reject(new Error('Unsupported curve'))
    },
    catch: () => new RolaVerificationError({ reason: 'couldNotDeriveAddress' })
  })

export class RolaVerifier extends Effect.Service<RolaVerifier>()(
  '@radix-vaults/server/auth/RolaVerifier',
  {
    effect: Effect.gen(function* () {
      const config = yield* AuthConfig
      const getEntityDetails = yield* GetEntityDetailsVaultAggregated

      const getOwnerKeysRawHex = (address: string) =>
        getEntityDetails([address], undefined, undefined).pipe(
          Effect.map(
            (details) =>
              details[0]?.metadata?.items.find((i) => i.key === 'owner_keys')
                ?.value.raw_hex ?? ''
          ),
          Effect.mapError(
            () =>
              new RolaVerificationError({
                reason: 'couldNotVerifyPublicKeyOnLedger'
              })
          )
        )

      const verify = (
        signedChallenge: SignedChallenge
      ): Effect.Effect<void, RolaVerificationError> =>
        Effect.gen(function* () {
          const publicKeyHash = yield* createPublicKeyHash(
            signedChallenge.proof.publicKey
          )
          const signatureMessage = yield* createSignatureMessage(
            signedChallenge.challenge,
            config.dAppDefinitionAddress,
            config.expectedOrigin
          )
          yield* verifySignature(signedChallenge, signatureMessage)

          const [ownerKeysHex, derivedAddress] = yield* Effect.all([
            getOwnerKeysRawHex(signedChallenge.address),
            deriveVirtualAddress(signedChallenge, config.networkId)
          ])

          const ownerKeysSet = ownerKeysHex.length > 0
          const ownerKeysMatch =
            ownerKeysSet &&
            ownerKeysHex.toUpperCase().includes(publicKeyHash.toUpperCase())
          const derivedAddressMatch =
            !ownerKeysSet && derivedAddress === signedChallenge.address

          if (!ownerKeysMatch && !derivedAddressMatch)
            yield* Effect.fail(
              new RolaVerificationError({ reason: 'invalidPublicKey' })
            )
        })

      return { verify } as const
    })
  }
) {}
