import { GatewayApiClient } from '@radix-effects/gateway'
import {
  TransactionManifestString,
  type TransactionId
} from '@radix-effects/shared'
import {
  CompileTransaction,
  CreateTransactionIntent,
  IntentHashService,
  Signer,
  SubmitTransaction,
  TransactionStatus
} from '@radix-effects/tx-tool'
import { Data, Effect } from 'effect'
import type { BootstrapConfig } from './config'
import { buildCreateBadgeResourceManifest } from './manifests'

export class BootstrapError extends Data.TaggedError('BootstrapError')<{
  message: string
}> {}

export type BootstrapResult = {
  teamMemberBadgeAddress: string
}

export const runBootstrap = (
  config: BootstrapConfig,
  feePayerAddress: string
) =>
  Effect.gen(function* () {
    const createIntent = yield* CreateTransactionIntent
    const intentHash = yield* IntentHashService
    const signer = yield* Signer
    const compile = yield* CompileTransaction
    const submit = yield* SubmitTransaction
    const txStatus = yield* TransactionStatus
    const gateway = yield* GatewayApiClient
    const networkId = config.networkId

    const submitAndPoll = (manifest: string) =>
      Effect.gen(function* () {
        const intent = yield* createIntent({
          manifest: TransactionManifestString.make(manifest)
        })
        const intentWithNotary = {
          ...intent,
          header: { ...intent.header, notaryIsSignatory: true }
        }
        const { id, hash } = yield* intentHash.create(intentWithNotary)
        const signatures = yield* signer.signToSignatureWithPublicKey(hash)
        const compiled = yield* compile({
          intent: intentWithNotary,
          signatures
        })
        yield* submit({ compiledTransaction: compiled })
        yield* Effect.logInfo(`Transaction submitted: ${id}`)
        yield* txStatus.poll({ id })
        return id
      })

    const getCreatedEntities = (id: TransactionId) =>
      gateway.transaction
        .getCommittedDetails(id, {
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
          )
        )

    yield* Effect.logInfo(`Fee payer address: ${feePayerAddress}`)

    // --- Create badge resource and distribute ---
    yield* Effect.logInfo('Creating badge resource and distributing...')

    const createBadgeManifest = yield* Effect.promise(() =>
      buildCreateBadgeResourceManifest({
        feePayerAddress,
        signers: config.signers,
        threshold: config.threshold,
        networkId,
        recipients: config.badgeRecipients,
        badgeName: config.badgeName
      })
    )

    const badgeTxId = yield* submitAndPoll(createBadgeManifest)
    yield* Effect.logInfo(`Badge creation tx committed: ${badgeTxId}`)

    const badgeEntities = yield* getCreatedEntities(badgeTxId)

    const teamMemberBadgeAddress = badgeEntities.find((addr) =>
      addr.startsWith('resource_')
    )

    if (!teamMemberBadgeAddress) {
      return yield* new BootstrapError({
        message: `No resource address found in transaction receipt. Entities: ${badgeEntities.join(', ')}`
      })
    }

    yield* Effect.logInfo(`Badge resource created: ${teamMemberBadgeAddress}`)

    if (config.badgeRecipients.length > 0) {
      yield* Effect.logInfo(
        `Badges distributed to ${config.badgeRecipients.length} recipient(s)`
      )
    }

    return { teamMemberBadgeAddress }
  })
