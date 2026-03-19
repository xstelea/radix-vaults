import { GatewayApiClient } from '@radix-effects/gateway'
import { Data, Effect, Layer } from 'effect'

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
  errorMessage?: string
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

const VALID_STATUSES = new Set<string>([
  'CommittedSuccess',
  'CommittedFailure',
  'Pending',
  'Rejected',
  'Unknown'
])

export const TransactionStatusCheckerLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const gateway = yield* GatewayApiClient

    const checker = (input: {
      intentHash: string
    }): Effect.Effect<TransactionStatusResult, TransactionStatusCheckError> =>
      gateway.transaction.innerClient
        .transactionStatus({
          transactionStatusRequest: { intent_hash: input.intentHash }
        })
        .pipe(
          Effect.map((response) => ({
            intentStatus: (VALID_STATUSES.has(response.status)
              ? response.status
              : 'Unknown') as TransactionStatusResult['intentStatus'],
            ...(response.error_message
              ? { errorMessage: response.error_message }
              : {})
          })),
          Effect.catchAll((e) =>
            Effect.fail(
              new TransactionStatusCheckError({
                message: `Failed to check transaction status: ${String(e)}`
              })
            )
          )
        )

    return Layer.succeed(
      TransactionStatusChecker,
      checker as unknown as TransactionStatusChecker
    )
  })
)
