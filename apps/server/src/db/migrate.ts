import { FileSystem, Path } from "@effect/platform"
import { NodeContext } from "@effect/platform-node"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Config, Effect } from "effect"
import pg from "pg"

export class DatabaseMigrations extends Effect.Service<DatabaseMigrations>()(
  "DatabaseMigrations",
  {
    dependencies: [NodeContext.layer],
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const connectionString = yield* Config.string("DATABASE_URL").pipe(
        Config.withDefault("postgres://postgres:postgres@localhost:5433/radix_vaults"),
      )

      const ssl = yield* Config.boolean("DATABASE_SSL").pipe(Config.withDefault(false))

      const resolveMigrationsFolder = Effect.gen(function* () {
        const candidates = ["packages/database/drizzle", "../../packages/database/drizzle"]

        for (const candidate of candidates) {
          const absolutePath = path.resolve(candidate)
          if (yield* fs.exists(absolutePath)) {
            return absolutePath
          }
        }

        return yield* Effect.die(
          new Error(`Migrations folder not found (tried: ${candidates.join(", ")})`),
        )
      })

      return Effect.fnUntraced(function* () {
        const migrationsFolder = yield* resolveMigrationsFolder

        yield* Effect.logInfo(`Running migrations from ${migrationsFolder}`)

        yield* Effect.acquireUseRelease(
          Effect.sync(() => new pg.Pool({ connectionString, ssl })),
          (pool) => Effect.promise(() => migrate(drizzle(pool), { migrationsFolder })),
          (pool) => Effect.promise(() => pool.end()),
        )

        yield* Effect.logInfo("Database migrations complete")
      })
    }),
  },
) {}
