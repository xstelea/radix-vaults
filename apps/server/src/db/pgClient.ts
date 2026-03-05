import { PgClient } from "@effect/sql-pg"
import { Config, Effect, Layer, Redacted } from "effect"

const defaultDatabaseUrl = "postgres://postgres:postgres@localhost:5433/radix_vaults"

export const PgClientLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    return PgClient.layer({
      url: yield* Config.redacted("DATABASE_URL").pipe(
        Config.withDefault(Redacted.make(defaultDatabaseUrl)),
      ),
    })
  }),
)
