import {
  Convert,
  RadixEngineToolkit,
  type IntentCoreV2,
  type IntentHeaderV2,
  type PartialTransactionV2
} from '@steleaio/radix-engine-toolkit'
import { blake2b } from '@noble/hashes/blake2.js'
import { Effect } from 'effect'

export interface UnsignedSubintentResult {
  subintentHash: string
  intentDiscriminator: string
  partialTransactionHex: string
  epochMin: number
  epochMax: number
}

export interface ExtractedSignature {
  publicKeyHex: string
  signatureHex: string
  keyType: 'ed25519' | 'secp256k1'
}

const ensureYieldToParent = (manifest: string): string => {
  const trimmed = manifest.trim()
  if (trimmed.endsWith('YIELD_TO_PARENT;')) return trimmed
  return `${trimmed}\nYIELD_TO_PARENT;\n`
}

const randomDiscriminator = (): string =>
  String(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))

export const buildUnsignedSubintent = (
  manifest: string,
  networkId: number,
  epochMin: number,
  epochMax: number,
  maxProposerTimestampSec?: number,
  minProposerTimestampSec?: number
): Effect.Effect<UnsignedSubintentResult, SubintentBuildError> =>
  Effect.tryPromise({
    try: async () => {
      const subintentManifest = ensureYieldToParent(manifest)
      const intentDiscriminator = randomDiscriminator()

      const header: IntentHeaderV2 = {
        networkId,
        startEpochInclusive: epochMin,
        endEpochExclusive: epochMax,
        intentDiscriminator: Number(intentDiscriminator),
        ...(maxProposerTimestampSec !== undefined && {
          maxProposerTimestampExclusive: maxProposerTimestampSec
        }),
        ...(minProposerTimestampSec !== undefined && {
          minProposerTimestampInclusive: minProposerTimestampSec
        })
      }

      const intentCore: IntentCoreV2 = {
        header,
        instructions: subintentManifest,
        blobs: [],
        message: {
          kind: 'PlainText',
          value: {
            mimeType: 'text/plain',
            message: { kind: 'String', value: '' }
          }
        },
        children: []
      }

      const partialTransaction: PartialTransactionV2 = {
        rootSubintent: { intentCore },
        nonRootSubintents: []
      }

      const subintentHash =
        await RadixEngineToolkit.PartialTransactionV2.hash(partialTransaction)
      const compiled =
        await RadixEngineToolkit.PartialTransactionV2.compile(
          partialTransaction
        )

      return {
        subintentHash: subintentHash.id,
        intentDiscriminator,
        partialTransactionHex: Convert.Uint8Array.toHexString(compiled),
        epochMin,
        epochMax
      }
    },
    catch: (e) => new SubintentBuildError({ message: String(e) })
  })

export const extractSignatureFromHex = (
  signedPartialHex: string,
  networkId: number
): Effect.Effect<ExtractedSignature, SignatureExtractionError> =>
  Effect.tryPromise({
    try: async () => {
      const bytes = Convert.HexString.toUint8Array(signedPartialHex)
      const signed =
        await RadixEngineToolkit.SignedPartialTransactionV2.decompile(
          bytes,
          networkId
        )

      const signatures = signed.rootSubintentSignatures
      if (signatures.length === 0) {
        const nonRootSigs = signed.nonRootSubintentSignatures
        const nonRootTotal = nonRootSigs.reduce(
          (sum, arr) => sum + arr.length,
          0
        )
        const diagParts = [
          `rootSubintentSignatures: ${signatures.length}`,
          `nonRootSubintentSignatures groups: ${nonRootSigs.length}`,
          `nonRootSubintentSignatures total: ${nonRootTotal}`,
          `hexLength: ${signedPartialHex.length}`,
          `keys: ${JSON.stringify(Object.keys(signed))}`
        ]
        throw new Error(
          `No signatures found in signed partial transaction. Diagnostics: ${diagParts.join(', ')}`
        )
      }

      const sig = signatures[0]!
      const signatureHex = Convert.Uint8Array.toHexString(sig.signature)

      if (sig.curve === 'Ed25519') {
        if (!sig.publicKey) {
          throw new Error('Ed25519 signature missing public key')
        }
        return {
          publicKeyHex: Convert.Uint8Array.toHexString(sig.publicKey),
          signatureHex,
          keyType: 'ed25519' as const
        }
      }

      // Secp256k1 — public key is not included in SignatureWithPublicKey,
      // but the wallet includes it in the signed response. For secp256k1,
      // the public key can be recovered from the signature + message hash.
      // For now, we require it to be present.
      if (sig.publicKey) {
        return {
          publicKeyHex: Convert.Uint8Array.toHexString(sig.publicKey),
          signatureHex,
          keyType: 'secp256k1' as const
        }
      }

      throw new Error(
        'Secp256k1 signature without embedded public key not supported'
      )
    },
    catch: (e) => new SignatureExtractionError({ message: String(e) })
  })

export const computeSubintentHashFromSignedPartial = (
  signedPartialHex: string,
  networkId: number
): Effect.Effect<string, SubintentBuildError> =>
  Effect.tryPromise({
    try: async () => {
      const bytes = Convert.HexString.toUint8Array(signedPartialHex)
      const signed =
        await RadixEngineToolkit.SignedPartialTransactionV2.decompile(
          bytes,
          networkId
        )

      // Hash just the partial transaction (unsigned portion)
      const partialTx: PartialTransactionV2 = {
        rootSubintent: signed.partialTransaction.rootSubintent,
        nonRootSubintents: signed.partialTransaction.nonRootSubintents
      }
      const hash = await RadixEngineToolkit.PartialTransactionV2.hash(partialTx)
      return hash.id
    },
    catch: (e) => new SubintentBuildError({ message: String(e) })
  })

export const computePublicKeyHash = (publicKeyHex: string): string => {
  const hash = blake2b(Buffer.from(publicKeyHex, 'hex'), { dkLen: 32 })
  const last29 = hash.subarray(-29)
  return Buffer.from(last29).toString('hex')
}

// --- Errors ---

import { Data } from 'effect'

export class SubintentBuildError extends Data.TaggedError(
  'SubintentBuildError'
)<{
  message: string
}> {}

export class SignatureExtractionError extends Data.TaggedError(
  'SignatureExtractionError'
)<{
  message: string
}> {}
