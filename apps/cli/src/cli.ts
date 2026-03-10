import { Command } from '@effect/cli'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import { Effect, Logger } from 'effect'
import { initCommand } from './commands/init'
import { runCommand } from './commands/run'

const bootstrap = Command.make('bootstrap').pipe(
  Command.withSubcommands([initCommand, runCommand])
)

const cli = Command.run(bootstrap, {
  name: 'radix-vaults',
  version: '0.1.0'
})

cli(process.argv).pipe(
  Effect.provide(NodeContext.layer),
  Effect.provide(Logger.pretty),
  NodeRuntime.runMain
)
