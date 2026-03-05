import { Rpc, RpcGroup } from '@effect/rpc'
import * as Schema from 'effect/Schema'

export const ServerHealthSchema = Schema.Struct({
  status: Schema.Literal('ok'),
  dbStatus: Schema.Literal('connected', 'disconnected'),
  timestamp: Schema.String
})

export const GetServerHealth = Rpc.make('GetServerHealth', {
  payload: {},
  success: ServerHealthSchema,
  error: Schema.String
})

export const AppRpc = RpcGroup.make(GetServerHealth)

export type ServerHealth = typeof ServerHealthSchema.Type
