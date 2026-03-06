import { SqlClient } from '@effect/sql'
import { Config, Effect } from 'effect'

export const seedTracerBulletData = Effect.gen(function* () {
  const seedEnabled = yield* Config.boolean('TRACER_BULLET_SEED').pipe(
    Config.withDefault(true)
  )

  if (!seedEnabled) {
    return
  }

  const sql = yield* SqlClient.SqlClient

  const countRows = yield* sql<{ count: number }>`
    SELECT COUNT(*)::int AS "count"
    FROM vaults
  `

  if ((countRows[0]?.count ?? 0) > 0) {
    return
  }

  yield* sql`
    INSERT INTO vaults (account_address, name)
    VALUES
      ('account_tdx_2_1qalpha', 'Alpha Vault'),
      ('account_tdx_2_1qbeta', 'Beta Vault')
  `

  yield* sql`
    INSERT INTO proposals (vault_address, status)
    VALUES
      ('account_tdx_2_1qalpha', 'created'),
      ('account_tdx_2_1qalpha', 'submitted'),
      ('account_tdx_2_1qbeta', 'signing')
  `

  yield* Effect.logInfo('Seeded tracer bullet vault data')
})
