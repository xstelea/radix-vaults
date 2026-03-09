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
    INSERT INTO proposals (vault_address, status, manifest, max_proposer_timestamp, created_by)
    VALUES
      ('account_tdx_2_1qalpha', 'created', 'CALL_METHOD Address("account_tdx_2_1qalpha") "deposit" ;', '2026-12-31T23:59:59', 'account_tdx_2_1qcreator'),
      ('account_tdx_2_1qalpha', 'submitted', 'CALL_METHOD Address("account_tdx_2_1qalpha") "withdraw" ;', '2026-12-31T23:59:59', 'account_tdx_2_1qcreator'),
      ('account_tdx_2_1qbeta', 'signing', 'CALL_METHOD Address("account_tdx_2_1qbeta") "deposit" ;', '2026-12-31T23:59:59', 'account_tdx_2_1qcreator')
  `

  yield* Effect.logInfo('Seeded tracer bullet vault data')
})
