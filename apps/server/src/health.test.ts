import { Effect } from "effect"
import { describe, expect, it } from "@effect/vitest"
import { checkDatabase, checkDatabaseWith } from "./health"
import { PgContainer } from "./test/PgContainer"

describe("checkDatabaseWith", () => {
  it.effect("returns connected when query succeeds", () =>
    Effect.gen(function* () {
      const result = yield* checkDatabaseWith(Effect.succeed({ ok: true }))
      expect(result).toBe("connected")
    }),
  )

  it.effect("returns disconnected when query fails", () =>
    Effect.gen(function* () {
      const result = yield* checkDatabaseWith(Effect.fail(new Error("boom")))
      expect(result).toBe("disconnected")
    }),
  )
})

describe("checkDatabase", () => {
  it.effect(
    "returns connected against real postgres",
    () =>
      Effect.gen(function* () {
        const result = yield* checkDatabase
        expect(result).toBe("connected")
      }).pipe(Effect.provide(PgContainer.ClientLive)),
    60_000,
  )
})
