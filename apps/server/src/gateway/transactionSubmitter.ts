import { Data, Effect } from 'effect'

export class TransactionSubmitError extends Data.TaggedError(
  'TransactionSubmitError'
)<{
  message: string
}> {}

export class TransactionSubmitter extends Effect.Service<TransactionSubmitter>()(
  '@radix-vaults/server/gateway/TransactionSubmitter',
  {
    effect: Effect.succeed(
      (input: {
        manifest: string
        signers: ReadonlyArray<{
          publicKey: string
          keyType: 'ed25519' | 'secp256k1'
        }>
      }): Effect.Effect<{ intentHash: string }, TransactionSubmitError> =>
        Effect.fail(
          new TransactionSubmitError({
            message:
              'TransactionSubmitter not configured. Wire up fee payer key via Bootstrap CLI (Issue #14).'
          })
        )
    )
  }
) {}
