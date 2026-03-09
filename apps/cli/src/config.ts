import { Config, Data, Effect, Schema } from 'effect'

export class BootstrapConfigError extends Data.TaggedError(
  'BootstrapConfigError'
)<{
  message: string
}> {}

export const SignerSchema = Schema.Struct({
  publicKey: Schema.String.pipe(
    Schema.pattern(/^[0-9a-fA-F]{64}$/, {
      message: () => 'Must be 64 hex characters (Ed25519 public key)'
    })
  ),
  keyType: Schema.optionalWith(Schema.Literal('ed25519', 'secp256k1'), {
    default: () => 'ed25519' as const
  })
})

export const BootstrapConfigSchema = Schema.Struct({
  networkId: Schema.Literal(1, 2),
  signers: Schema.NonEmptyArray(SignerSchema),
  threshold: Schema.Int.pipe(Schema.greaterThan(0)),
  badgeRecipients: Schema.NonEmptyArray(
    Schema.String.pipe(Schema.minLength(1))
  ),
  badgeName: Schema.optionalWith(Schema.String, {
    default: () => 'Team Member Badge'
  })
})

export type BootstrapConfig = typeof BootstrapConfigSchema.Type

export const readBootstrapConfig = (
  filePath: string
): Effect.Effect<BootstrapConfig, BootstrapConfigError> =>
  Effect.gen(function* () {
    const raw = yield* Effect.tryPromise({
      try: async () => {
        const fs = await import('node:fs/promises')
        const content = await fs.readFile(filePath, 'utf-8')
        return JSON.parse(content) as unknown
      },
      catch: (e) =>
        new BootstrapConfigError({
          message: `Failed to read ${filePath}: ${e}`
        })
    })

    const config = yield* Schema.decodeUnknown(BootstrapConfigSchema)(raw).pipe(
      Effect.mapError(
        (e) =>
          new BootstrapConfigError({
            message: `Invalid bootstrap config: ${e.message}`
          })
      )
    )

    if (config.threshold > config.signers.length) {
      return yield* new BootstrapConfigError({
        message: `Threshold (${config.threshold}) exceeds number of signers (${config.signers.length})`
      })
    }

    return config
  })

export const readFeePayerKey = Effect.gen(function* () {
  const hex = yield* Config.string('FEE_PAYER_PRIVATE_KEY_HEX').pipe(
    Effect.mapError(
      () =>
        new BootstrapConfigError({
          message: 'FEE_PAYER_PRIVATE_KEY_HEX environment variable is required'
        })
    )
  )

  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    return yield* new BootstrapConfigError({
      message: 'FEE_PAYER_PRIVATE_KEY_HEX must be 64 hex characters'
    })
  }

  return hex
})
