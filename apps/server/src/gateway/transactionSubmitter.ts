import { Data, Effect } from 'effect'

export class TransactionSubmitError extends Data.TaggedError(
  'TransactionSubmitError'
)<{
  message: string
}> {}

export interface PreviewSubintentResult {
  receipt: Record<string, unknown> | undefined
  logs: Array<{ level: string; message: string }>
}

export class TransactionSubmitter extends Effect.Service<TransactionSubmitter>()(
  '@radix-vaults/server/gateway/TransactionSubmitter',
  {
    effect: Effect.succeed({
      feePayerAddress: '',

      submitFeePayerOnly: (
        _manifest: string
      ): Effect.Effect<
        { intentHash: string; entities: string[] },
        TransactionSubmitError
      > =>
        Effect.fail(
          new TransactionSubmitError({
            message:
              'TransactionSubmitter not configured. Provide TransactionSubmitterLive layer.'
          })
        ),

      submitWithSubintent: (_args: {
        partialTransactionHex: string
        signatures: ReadonlyArray<{
          publicKeyHex: string
          signatureHex: string
          keyType: 'ed25519' | 'secp256k1'
        }>
      }): Effect.Effect<{ intentHash: string }, TransactionSubmitError> =>
        Effect.fail(
          new TransactionSubmitError({
            message:
              'TransactionSubmitter not configured. Provide TransactionSubmitterLive layer.'
          })
        ),

      previewSubintent: (
        _partialTransactionHex: string
      ): Effect.Effect<PreviewSubintentResult, TransactionSubmitError> =>
        Effect.fail(
          new TransactionSubmitError({
            message:
              'TransactionSubmitter not configured. Provide TransactionSubmitterLive layer.'
          })
        )
    })
  }
) {}
