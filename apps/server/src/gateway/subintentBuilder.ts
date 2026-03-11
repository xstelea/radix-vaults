import {
  Convert,
  PrivateKey,
  PublicKey,
  RadixEngineToolkit,
  SignatureWithPublicKey,
  TransactionV2Builder,
  type IntentCoreV2,
  type IntentHeaderV2,
  type PartialTransactionV2,
  type SignedPartialTransactionV2,
  type TransactionHeaderV2
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
  maxProposerTimestampMs?: number
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
        ...(maxProposerTimestampMs !== undefined && {
          maxProposerTimestampExclusive: maxProposerTimestampMs
        })
      }

      const intentCore: IntentCoreV2 = {
        header,
        instructions: subintentManifest,
        blobs: [],
        message: { kind: 'None' },
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
        throw new Error('No signatures found in signed partial transaction')
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

export const reconstructAndCompose = (
  partialTxHex: string,
  signatures: ReadonlyArray<{
    publicKeyHex: string
    signatureHex: string
    keyType: 'ed25519' | 'secp256k1'
  }>,
  feePayerPrivateKeyHex: string,
  feePayerAccountAddress: string,
  networkId: number,
  currentEpoch: number
): Effect.Effect<
  { notarizedTransactionHex: string; intentHash: string },
  TransactionCompositionError
> =>
  Effect.tryPromise({
    try: async () => {
      // 1. Decompile the stored unsigned partial transaction
      const partialBytes = Convert.HexString.toUint8Array(partialTxHex)
      const partialTx = await RadixEngineToolkit.PartialTransactionV2.decompile(
        partialBytes,
        networkId
      )

      // 2. Build SignatureWithPublicKey array from collected signatures
      const signaturesWithPk: SignatureWithPublicKey[] = signatures.map(
        (sig) => {
          const sigBytes = Convert.HexString.toUint8Array(sig.signatureHex)
          const pubKeyBytes = Convert.HexString.toUint8Array(sig.publicKeyHex)
          return sig.keyType === 'ed25519'
            ? new SignatureWithPublicKey.Ed25519(sigBytes, pubKeyBytes)
            : new SignatureWithPublicKey.Secp256k1(sigBytes)
        }
      )

      // 3. Fee payer key
      const feePayerKey = new PrivateKey.Ed25519(feePayerPrivateKeyHex)

      // 4. Compute the child subintent hash (needed for USE_CHILD + children array)
      const childHash = await RadixEngineToolkit.SubintentV2.hash(
        partialTx.rootSubintent
      )

      // 5. Build main transaction header
      const transactionHeader: TransactionHeaderV2 = {
        notaryPublicKey: feePayerKey.publicKey(),
        notaryIsSignatory: true,
        tipBasisPoints: 0
      }

      // 6. Main intent: USE_CHILD + lock_fee + yield_to_child
      const mainManifest = `USE_CHILD
  NamedIntent("withdrawal")
  Intent("${childHash.id}")
;
CALL_METHOD
  Address("${feePayerAccountAddress}")
  "lock_fee"
  Decimal("10")
;
YIELD_TO_CHILD
  NamedIntent("withdrawal")
;
`

      const mainIntentHeader: IntentHeaderV2 = {
        networkId,
        startEpochInclusive: currentEpoch,
        endEpochExclusive: currentEpoch + 10,
        intentDiscriminator: Number(randomDiscriminator())
      }

      const rootIntentCore: IntentCoreV2 = {
        header: mainIntentHeader,
        instructions: mainManifest,
        blobs: [],
        message: { kind: 'None' },
        children: [childHash.hash]
      }

      // 7. Build the notarized transaction V2
      const builder = await TransactionV2Builder.new()
      const notarized = await builder
        .header(transactionHeader)
        .rootIntentCore(rootIntentCore)
        .addSignedSubintent(partialTx.rootSubintent, signaturesWithPk)
        .notarize(feePayerKey)

      // 7. Compile to hex
      const compiledBytes =
        await RadixEngineToolkit.NotarizedTransactionV2.compile(notarized)
      const notarizedTransactionHex =
        Convert.Uint8Array.toHexString(compiledBytes)

      // 8. Get intent hash
      const txHash =
        await RadixEngineToolkit.NotarizedTransactionV2.hash(notarized)

      return {
        notarizedTransactionHex,
        intentHash: txHash.id
      }
    },
    catch: (e) => new TransactionCompositionError({ message: String(e) })
  })

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

export class TransactionCompositionError extends Data.TaggedError(
  'TransactionCompositionError'
)<{
  message: string
}> {}
