import { GatewayApiClient } from '@radix-effects/gateway'
import {
  Convert,
  PrivateKey,
  RadixEngineToolkit,
  TransactionBuilder,
  generateRandomNonce
} from '@radixdlt/radix-engine-toolkit'
import type { TransactionManifest } from '@radixdlt/radix-engine-toolkit'
import { Data, Effect, Schedule } from 'effect'

export class TransactionBuildError extends Data.TaggedError(
  'TransactionBuildError'
)<{
  message: string
}> {}

export class TransactionPollError extends Data.TaggedError(
  'TransactionPollError'
)<{
  message: string
}> {}

export class TransactionService extends Effect.Service<TransactionService>()(
  '@radix-vaults/cli/TransactionService',
  {
    effect: Effect.gen(function* () {
      const gateway = yield* GatewayApiClient

      const getCurrentEpoch = () =>
        gateway.status.getCurrent().pipe(
          Effect.map((status) => status.ledger_state.epoch),
          Effect.catchAll(
            (e) =>
              new TransactionBuildError({
                message: `Failed to get current epoch: ${e._tag}`
              })
          )
        )

      const buildAndSubmit = (input: {
        manifestString: string
        notaryPrivateKey: PrivateKey
        networkId: number
      }): Effect.Effect<{ intentHash: string }, TransactionBuildError> =>
        Effect.gen(function* () {
          const epoch = yield* getCurrentEpoch()

          const manifest: TransactionManifest = {
            instructions: { kind: 'String', value: input.manifestString },
            blobs: []
          }

          const notarizedTx = yield* Effect.tryPromise({
            try: () =>
              TransactionBuilder.new().then((builder) =>
                builder
                  .header({
                    networkId: input.networkId,
                    startEpochInclusive: epoch,
                    endEpochExclusive: epoch + 10,
                    nonce: generateRandomNonce(),
                    notaryPublicKey: input.notaryPrivateKey.publicKey(),
                    notaryIsSignatory: true,
                    tipPercentage: 0
                  })
                  .manifest(manifest)
                  .notarize(input.notaryPrivateKey)
              ),
            catch: (e) =>
              new TransactionBuildError({
                message: `Failed to build transaction: ${e}`
              })
          })

          const intentHash = yield* Effect.tryPromise({
            try: () =>
              RadixEngineToolkit.NotarizedTransaction.intentHash(notarizedTx),
            catch: (e) =>
              new TransactionBuildError({
                message: `Failed to get intent hash: ${e}`
              })
          })

          const compiled = yield* Effect.tryPromise({
            try: () =>
              RadixEngineToolkit.NotarizedTransaction.compile(notarizedTx),
            catch: (e) =>
              new TransactionBuildError({
                message: `Failed to compile transaction: ${e}`
              })
          })

          const hex = Convert.Uint8Array.toHexString(compiled)

          yield* gateway.transaction.innerClient
            .transactionSubmit({
              transactionSubmitRequest: {
                notarized_transaction_hex: hex
              }
            })
            .pipe(
              Effect.catchAll(
                (e) =>
                  new TransactionBuildError({
                    message: `Failed to submit transaction: ${e._tag}: ${'message' in e ? e.message : String(e)}`
                  })
              )
            )

          const hashHex = Convert.Uint8Array.toHexString(intentHash.hash)
          return { intentHash: hashHex }
        })

      const checkStatus = (
        intentHash: string
      ): Effect.Effect<void, TransactionPollError> =>
        gateway.transaction.innerClient
          .transactionStatus({
            transactionStatusRequest: {
              intent_hash: intentHash
            }
          })
          .pipe(
            Effect.catchAll(
              () =>
                new TransactionPollError({
                  message: 'Failed to query transaction status'
                })
            ),
            Effect.flatMap((response) => {
              const status = response.intent_status
              if (status === 'CommittedSuccess') {
                return Effect.void
              }
              if (
                status === 'CommittedFailure' ||
                status === 'PermanentlyRejected'
              ) {
                return Effect.fail(
                  new TransactionPollError({
                    message: `Transaction ${status}: ${response.intent_status_description}`
                  })
                )
              }
              return Effect.fail(
                new TransactionPollError({ message: 'pending' })
              )
            })
          )

      const pollUntilCommitted = (
        intentHash: string
      ): Effect.Effect<void, TransactionPollError> =>
        checkStatus(intentHash).pipe(
          Effect.retry(
            Schedule.intersect(
              Schedule.recurs(30),
              Schedule.spaced('2 seconds')
            ).pipe(
              Schedule.whileInput(
                (e: TransactionPollError) => e.message === 'pending'
              )
            )
          )
        )

      const getCreatedEntities = (
        intentHash: string
      ): Effect.Effect<ReadonlyArray<string>, TransactionPollError> =>
        gateway.transaction
          .getCommittedDetails(intentHash, {
            rawHex: false,
            receiptEvents: false,
            receiptFeeSource: false,
            receiptFeeSummary: false,
            receiptFeeDestination: false,
            receiptCostingParameters: false,
            receiptStateChanges: true,
            affectedGlobalEntities: true,
            balanceChanges: false,
            receiptOutput: false,
            manifestInstructions: false
          })
          .pipe(
            Effect.map(
              (details) => details.transaction.affected_global_entities ?? []
            ),
            Effect.catchAll(
              (e) =>
                new TransactionPollError({
                  message: `Failed to get committed details: ${e._tag}`
                })
            )
          )

      return {
        buildAndSubmit,
        pollUntilCommitted,
        getCreatedEntities
      } as const
    })
  }
) {}
