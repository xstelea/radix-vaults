import {
  Convert,
  PrivateKey,
  RadixEngineToolkit
} from '@steleaio/radix-engine-toolkit'
import { Effect } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { beforeAll } from 'vitest'
import {
  extractSignatureFromHex,
  SignatureExtractionError
} from './subintentBuilder'

// Stokenet signed partial transaction hex (0 signatures) — re-signed in beforeAll
const emptySignedPartialHex =
  '4d220e03210221012105210607020a63f20200000000000aa3f40200000000002201010507f6b76900000000220101058747b969000000000a67d720d23ea8130020200022010121020c0a746578742f706c61696e2200010c00202000202205410380009a40f7184afd330ab15ba9f65a81457087e5ddc250684fac7888aabf6fab0c046d696e74210123872101021db5dda0d53f400ee11facbdcea253d9afc27289e53e8b23abb080db46d00121020c04426172740c83017265736f757263655f7464785f325f316e66787878787878787878786564323573677878787878787878783030323233363735373233377878787878787878783365326370613a5b623564646130643533663430306565313166616362646365613235336439616663323732383965353365386232336162623038306462343664305d020180009a40f7184afd330ab15ba9f65a81457087e5ddc250684fac7888aabf6fab41038000512585d8e3ae21c87585c7845efa45676fb9cef3bae84da9299a2e51809d0c147472795f6465706f7369745f6f725f61626f727421028100000000220000440380009a40f7184afd330ab15ba9f65a81457087e5ddc250684fac7888aabf6fab0c097365745f6f776e6572210122020122000122020207012022020001210280009a4c6318c6318c6cb554820c6318c6318cf7a951d7a9e547c6318c6318c687021d60ebb81940df6dbf05982e9b718e2f58f332554bda8531dd7938c164650001210280009a4c6318c6318c6cb554820c6318c6318cf7a951d7a9e547c6318c6318c687021db5dda0d53f400ee11facbdcea253d9afc27289e53e8b23abb080db46d060012100202100202200202000'

const stokenetNetworkId = 2

let signedPartialHex: string
let expectedPublicKeyHex: string

beforeAll(async () => {
  // Decompile as SignedPartialTransactionV2, extract the inner partial
  const bytes = Convert.HexString.toUint8Array(emptySignedPartialHex)
  const decompiled =
    await RadixEngineToolkit.SignedPartialTransactionV2.decompile(
      bytes,
      stokenetNetworkId
    )
  const partial = decompiled.partialTransaction
  const hashResult = await RadixEngineToolkit.PartialTransactionV2.hash(partial)

  const privateKey = new PrivateKey.Ed25519('0'.repeat(62) + '01')
  expectedPublicKeyHex = privateKey.publicKeyHex()
  const sig = privateKey.signToSignatureWithPublicKey(hashResult.hash)

  const signed = {
    partialTransaction: partial,
    rootSubintentSignatures: [sig],
    nonRootSubintentSignatures: []
  }

  const compiled =
    await RadixEngineToolkit.SignedPartialTransactionV2.compile(signed)
  signedPartialHex = Convert.Uint8Array.toHexString(compiled)
})

describe('extractSignatureFromHex', () => {
  it.effect('extracts Ed25519 signature from signed partial transaction', () =>
    Effect.gen(function* () {
      const result = yield* extractSignatureFromHex(
        signedPartialHex,
        stokenetNetworkId
      )

      expect(result.keyType).toBe('ed25519')
      expect(result.publicKeyHex).toBe(expectedPublicKeyHex)
      expect(result.signatureHex).toMatch(/^[0-9a-f]{128}$/)
    })
  )

  it.effect('fails with SignatureExtractionError for invalid hex', () =>
    Effect.gen(function* () {
      const result = yield* Effect.either(
        extractSignatureFromHex('not_valid_hex', stokenetNetworkId)
      )

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(SignatureExtractionError)
      }
    })
  )

  it.effect(
    'fails with SignatureExtractionError when no signatures present',
    () =>
      Effect.gen(function* () {
        const result = yield* Effect.either(
          extractSignatureFromHex(emptySignedPartialHex, stokenetNetworkId)
        )

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(SignatureExtractionError)
          expect(result.left.message).toContain('No signatures found')
        }
      })
  )
})
