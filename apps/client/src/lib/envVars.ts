import * as EffectBoolean from 'effect/Boolean'
import * as Either from 'effect/Either'
import { constant, pipe } from 'effect/Function'
import { TreeFormatter } from 'effect/ParseResult'
import * as Schema from 'effect/Schema'

class EnvVars extends Schema.Class<EnvVars>('EnvVars')({
  ENV: Schema.Literal('dev', 'staging', 'prod', 'local').annotations({
    decodingFallback: () => Either.right('prod' as const)
  }),
  API_BASE_URL: Schema.String.annotations({
    decodingFallback: () => Either.right('http://localhost:3001')
  }),
  DAPP_DEFINITION_ADDRESS: Schema.String.annotations({
    decodingFallback: () =>
      Either.right(
        'account_tdx_2_12yf9gd53yfep7a669fv2t3wm7nz9zeezwd04n02a433ker8vza6rhe'
      )
  })
}) {}

const isVitest = typeof import.meta.env.VITEST !== 'undefined'

const vitestMockEnvVars: typeof EnvVars.Encoded = {
  ENV: 'dev',
  API_BASE_URL: '',
  DAPP_DEFINITION_ADDRESS: ''
}

export const envVars = pipe(
  EffectBoolean.match(isVitest, {
    onTrue: constant(vitestMockEnvVars),
    onFalse: constant({
      ENV: import.meta.env.VITE_ENV as unknown,
      API_BASE_URL: import.meta.env.VITE_API_BASE_URL as unknown,
      DAPP_DEFINITION_ADDRESS: import.meta.env
        .VITE_DAPP_DEFINITION_ADDRESS as unknown
    } satisfies Record<keyof typeof EnvVars.Encoded, unknown>)
  }),
  Schema.decodeUnknownEither(EnvVars),
  Either.map((envVars) => ({
    ...envVars,
    EFFECTIVE_ENV: envVars.ENV === 'local' ? 'dev' : envVars.ENV
  })),
  Either.getOrElse((parseIssue) => {
    throw new Error(
      `Invalid environment variables: ${TreeFormatter.formatErrorSync(parseIssue)}`
    )
  })
)
