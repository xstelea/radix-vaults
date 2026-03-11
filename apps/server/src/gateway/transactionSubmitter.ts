import { Data, Effect } from 'effect'

export class TransactionSubmitError extends Data.TaggedError(
  'TransactionSubmitError'
)<{
  message: string
}> {}

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

      submitNotarizedHex: (
        _notarizedTransactionHex: string
      ): Effect.Effect<void, TransactionSubmitError> =>
        Effect.fail(
          new TransactionSubmitError({
            message:
              'TransactionSubmitter not configured. Provide TransactionSubmitterLive layer.'
          })
        )
    })
  }
) {}
