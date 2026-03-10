import { Command, Options, Prompt } from '@effect/cli'
import { Effect, Schema } from 'effect'
import { writeFile } from 'node:fs/promises'
import { BootstrapConfigSchema } from '../config'

const output = Options.text('output').pipe(
  Options.withDefault('bootstrap.json')
)

type Signer =
  | { publicKey: string; keyType: 'ed25519' | 'secp256k1' }
  | { virtualBadge: string }

const collectSigners = Effect.gen(function* () {
  const signers: Signer[] = []

  yield* Effect.logInfo(
    'Add signers (at least one required). Enter empty input when done.'
  )

  while (true) {
    const num = signers.length + 1
    const input = yield* Prompt.text({
      message: `Signer ${num} — public key (64 hex) or badge (resource_...:[hex])`,
      default: ''
    })

    if (!input) {
      if (signers.length === 0) {
        yield* Effect.logWarning('At least one signer is required.')
        continue
      }
      break
    }

    if (/^[0-9a-fA-F]{64}$/.test(input)) {
      const keyType = yield* Prompt.select({
        message: `Signer ${num} key type`,
        choices: [
          { title: 'ed25519', value: 'ed25519' as const },
          { title: 'secp256k1', value: 'secp256k1' as const }
        ]
      })
      signers.push({ publicKey: input, keyType })
    } else if (/^resource_(?:rdx|tdx_\d+_)\w+:\[[0-9a-fA-F]+\]$/.test(input)) {
      signers.push({ virtualBadge: input })
    } else {
      yield* Effect.logWarning(
        'Invalid input. Enter a 64-hex public key or a NonFungibleGlobalId.'
      )
    }
  }

  return signers
})

const collectRecipients = Effect.gen(function* () {
  const recipients: string[] = []

  yield* Effect.logInfo(
    'Add badge recipient account addresses (at least one). Enter empty to finish.'
  )

  while (true) {
    const addr = yield* Prompt.text({
      message: `Recipient ${recipients.length + 1} address`,
      default: ''
    })

    if (!addr) {
      if (recipients.length === 0) {
        yield* Effect.logWarning('At least one recipient is required.')
        continue
      }
      break
    }

    recipients.push(addr)
  }

  return recipients
})

export const initCommand = Command.make('init', { output }, ({ output }) =>
  Effect.gen(function* () {
    yield* Effect.logInfo('Radix Vaults — Bootstrap Config Generator\n')

    // 1. Network
    const networkId = yield* Prompt.select({
      message: 'Network',
      choices: [
        { title: 'Mainnet', value: 1 as const },
        { title: 'Stokenet', value: 2 as const }
      ]
    })

    // 2. Signers
    const signers = yield* collectSigners

    // 3. Threshold
    const threshold = yield* Prompt.integer({
      message: 'Signature threshold',
      min: 1,
      max: signers.length,
      validate: (value) =>
        value > signers.length
          ? Effect.fail(
              `Threshold (${value}) cannot exceed number of signers (${signers.length})`
            )
          : Effect.succeed(value)
    })

    // 4. Badge recipients
    const badgeRecipients = yield* collectRecipients

    // 5. Badge name
    const badgeName = yield* Prompt.text({
      message: 'Badge name',
      default: 'Team Member Badge'
    })

    // Build config object
    const config = {
      networkId,
      signers,
      threshold,
      badgeRecipients,
      ...(badgeName !== 'Team Member Badge' ? { badgeName } : {})
    }

    // Validate with schema
    yield* Schema.decodeUnknown(BootstrapConfigSchema)(config).pipe(
      Effect.mapError((e) => new Error(`Validation failed: ${e.message}`)),
      Effect.catchAll((e) => Effect.die(e))
    )

    // Write file
    yield* Effect.tryPromise({
      try: () => writeFile(output, JSON.stringify(config, null, 2) + '\n'),
      catch: (e) => new Error(`Failed to write ${output}: ${e}`)
    }).pipe(Effect.catchAll((e) => Effect.die(e)))

    yield* Effect.logInfo(`Wrote ${output}`)
    yield* Effect.logInfo('')
    yield* Effect.logInfo('Next steps:')
    yield* Effect.logInfo(
      '  1. Set the fee payer key:  export FEE_PAYER_PRIVATE_KEY_HEX=<your-64-hex-key>'
    )
    yield* Effect.logInfo('  2. Run bootstrap:          pnpm bootstrap')
  })
)
