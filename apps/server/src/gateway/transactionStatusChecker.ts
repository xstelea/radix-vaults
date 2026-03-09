import { Data, Effect } from 'effect'

export class TransactionStatusCheckError extends Data.TaggedError(
  'TransactionStatusCheckError'
)<{
  message: string
}> {}

export type TransactionStatusResult = {
  intentStatus:
    | 'CommittedSuccess'
    | 'CommittedFailure'
    | 'Pending'
    | 'Rejected'
    | 'Unknown'
}

export class TransactionStatusChecker extends Effect.Service<TransactionStatusChecker>()(
  '@radix-vaults/server/gateway/TransactionStatusChecker',
  {
    effect: Effect.succeed(
      (_input: {
        intentHash: string
      }): Effect.Effect<TransactionStatusResult, TransactionStatusCheckError> =>
        Effect.fail(
          new TransactionStatusCheckError({
            message:
              'TransactionStatusChecker not configured. Wire up Gateway API client.'
          })
        )
    )
  }
) {}
