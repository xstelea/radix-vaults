import { Command, Options, Prompt } from '@effect/cli'
import { Effect, Schema } from 'effect'
import { writeFile } from 'node:fs/promises'
import { BootstrapConfigSchema } from '../config'

const output = Options.text('output').pipe(
  Options.withDefault('bootstrap.json')
)

type Member = {
  name: string
  signer:
    | { publicKey: string; keyType: 'ed25519' | 'secp256k1' }
    | { virtualBadge: string }
  recipientAccount: string
}

const collectMembers = Effect.gen(function* () {
  const members: Member[] = []

  yield* Effect.logInfo(
    'Add team members (at least one required). Enter empty name when done.'
  )

  while (true) {
    const num = members.length + 1
    const name = yield* Prompt.text({
      message: `Member ${num} — name`,
      default: ''
    })

    if (!name) {
      if (members.length === 0) {
        yield* Effect.logWarning('At least one member is required.')
        continue
      }
      break
    }

    const signerInput = yield* Prompt.text({
      message: `Member ${num} — public key (64 hex) or badge (resource_...:[hex])`,
      default: ''
    })

    if (!signerInput) {
      yield* Effect.logWarning('Signer is required for each member.')
      continue
    }

    let signer: Member['signer']
    if (/^[0-9a-fA-F]{64}$/.test(signerInput)) {
      const keyType = yield* Prompt.select({
        message: `Member ${num} key type`,
        choices: [
          { title: 'ed25519', value: 'ed25519' as const },
          { title: 'secp256k1', value: 'secp256k1' as const }
        ]
      })
      signer = { publicKey: signerInput, keyType }
    } else if (
      /^resource_(?:rdx|tdx_\d+_)\w+:\[[0-9a-fA-F]+\]$/.test(signerInput)
    ) {
      signer = { virtualBadge: signerInput }
    } else {
      yield* Effect.logWarning(
        'Invalid input. Enter a 64-hex public key or a NonFungibleGlobalId.'
      )
      continue
    }

    const recipientAccount = yield* Prompt.text({
      message: `Member ${num} — recipient account address`,
      default: ''
    })

    if (!recipientAccount) {
      yield* Effect.logWarning('Recipient account is required.')
      continue
    }

    members.push({ name, signer, recipientAccount })
  }

  return members
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

    // 2. Members (name + signer + recipient)
    const members = yield* collectMembers

    // 3. Threshold
    const threshold = yield* Prompt.integer({
      message: 'Signature threshold',
      min: 1,
      max: members.length,
      validate: (value) =>
        value > members.length
          ? Effect.fail(
              `Threshold (${value}) cannot exceed number of members (${members.length})`
            )
          : Effect.succeed(value)
    })

    // 4. Badge name
    const badgeName = yield* Prompt.text({
      message: 'Badge name',
      default: 'Team Member Badge'
    })

    // Build config object
    const config = {
      networkId,
      members,
      threshold,
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
