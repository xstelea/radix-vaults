import { PrivateKey, RadixEngineToolkit } from '@radixdlt/radix-engine-toolkit'
import { Data, Effect } from 'effect'
import type { BootstrapConfig } from './config'
import {
  buildCreateBadgeResourceManifest,
  buildCreateTeamAccountManifest,
  buildDistributeBadgesManifest,
  type NetworkId
} from './manifests'
import { TransactionService } from './transactionService'

export class BootstrapError extends Data.TaggedError('BootstrapError')<{
  message: string
}> {}

export type BootstrapResult = {
  teamAccountAddress: string
  teamMemberBadgeAddress: string
}

export const runBootstrap = (
  config: BootstrapConfig,
  feePayerKeyHex: string
): Effect.Effect<BootstrapResult, BootstrapError, TransactionService> =>
  Effect.gen(function* () {
    const txService = yield* TransactionService
    const networkId = config.networkId as NetworkId

    const notaryPrivateKey = new PrivateKey.Ed25519(feePayerKeyHex)
    const feePayerAddress = yield* Effect.tryPromise({
      try: () =>
        RadixEngineToolkit.Derive.virtualAccountAddressFromPublicKey(
          notaryPrivateKey.publicKey(),
          networkId
        ),
      catch: (e) =>
        new BootstrapError({
          message: `Failed to derive fee payer address: ${e}`
        })
    })

    yield* Effect.logInfo(`Fee payer address: ${feePayerAddress}`)

    // --- Step 1: Create team account ---
    yield* Effect.logInfo('Step 1: Creating team account...')

    const createAccountManifest = buildCreateTeamAccountManifest({
      feePayerAddress,
      signers: config.signers.map((s) => ({
        publicKey: s.publicKey,
        keyType: s.keyType
      })),
      threshold: config.threshold,
      networkId
    })

    const { intentHash: accountTxHash } = yield* txService
      .buildAndSubmit({
        manifestString: createAccountManifest,
        notaryPrivateKey,
        networkId
      })
      .pipe(
        Effect.mapError(
          (e) => new BootstrapError({ message: `Create account: ${e.message}` })
        )
      )

    yield* Effect.logInfo(`Account creation tx submitted: ${accountTxHash}`)

    yield* txService.pollUntilCommitted(accountTxHash).pipe(
      Effect.mapError(
        (e) =>
          new BootstrapError({
            message: `Account creation failed: ${e.message}`
          })
      )
    )

    const accountEntities = yield* txService
      .getCreatedEntities(accountTxHash)
      .pipe(
        Effect.mapError(
          (e) =>
            new BootstrapError({
              message: `Failed to read account creation receipt: ${e.message}`
            })
        )
      )

    const teamAccountAddress = accountEntities.find((addr) =>
      addr.startsWith('account_')
    )

    if (!teamAccountAddress) {
      return yield* new BootstrapError({
        message: `No account address found in transaction receipt. Entities: ${accountEntities.join(', ')}`
      })
    }

    yield* Effect.logInfo(`Team account created: ${teamAccountAddress}`)

    // --- Step 2: Create badge resource ---
    yield* Effect.logInfo('Step 2: Creating badge resource...')

    const createBadgeManifest = buildCreateBadgeResourceManifest({
      feePayerAddress,
      signers: config.signers.map((s) => ({
        publicKey: s.publicKey,
        keyType: s.keyType
      })),
      threshold: config.threshold,
      networkId,
      recipientCount: config.badgeRecipients.length,
      badgeName: config.badgeName
    })

    const { intentHash: badgeTxHash } = yield* txService
      .buildAndSubmit({
        manifestString: createBadgeManifest,
        notaryPrivateKey,
        networkId
      })
      .pipe(
        Effect.mapError(
          (e) =>
            new BootstrapError({
              message: `Create badge resource: ${e.message}`
            })
        )
      )

    yield* Effect.logInfo(`Badge creation tx submitted: ${badgeTxHash}`)

    yield* txService.pollUntilCommitted(badgeTxHash).pipe(
      Effect.mapError(
        (e) =>
          new BootstrapError({
            message: `Badge creation failed: ${e.message}`
          })
      )
    )

    const badgeEntities = yield* txService.getCreatedEntities(badgeTxHash).pipe(
      Effect.mapError(
        (e) =>
          new BootstrapError({
            message: `Failed to read badge creation receipt: ${e.message}`
          })
      )
    )

    const teamMemberBadgeAddress = badgeEntities.find((addr) =>
      addr.startsWith('resource_')
    )

    if (!teamMemberBadgeAddress) {
      return yield* new BootstrapError({
        message: `No resource address found in transaction receipt. Entities: ${badgeEntities.join(', ')}`
      })
    }

    yield* Effect.logInfo(`Badge resource created: ${teamMemberBadgeAddress}`)

    // --- Step 3: Distribute badges to recipients ---
    if (config.badgeRecipients.length > 0) {
      yield* Effect.logInfo('Step 3: Distributing badges to recipients...')

      const distributeManifest = buildDistributeBadgesManifest({
        feePayerAddress,
        badgeResourceAddress: teamMemberBadgeAddress,
        recipients: config.badgeRecipients
      })

      const { intentHash: distributeTxHash } = yield* txService
        .buildAndSubmit({
          manifestString: distributeManifest,
          notaryPrivateKey,
          networkId
        })
        .pipe(
          Effect.mapError(
            (e) =>
              new BootstrapError({
                message: `Distribute badges: ${e.message}`
              })
          )
        )

      yield* Effect.logInfo(
        `Badge distribution tx submitted: ${distributeTxHash}`
      )

      yield* txService.pollUntilCommitted(distributeTxHash).pipe(
        Effect.mapError(
          (e) =>
            new BootstrapError({
              message: `Badge distribution failed: ${e.message}`
            })
        )
      )

      yield* Effect.logInfo(
        `Badges distributed to ${config.badgeRecipients.length} recipient(s)`
      )
    }

    return { teamAccountAddress, teamMemberBadgeAddress }
  })
