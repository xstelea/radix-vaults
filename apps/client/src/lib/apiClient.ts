import { FetchHttpClient, HttpApiClient } from '@effect/platform'
import {
  AppApi,
  type VaultDetail,
  type VaultListItem,
  type VaultSigners
} from '@radix-vaults/shared'
import { Effect, Layer } from 'effect'
import { envVars } from './envVars'

const apiBaseUrl = envVars.API_BASE_URL

const FetchLive = FetchHttpClient.layer.pipe(
  Layer.provide(
    Layer.succeed(FetchHttpClient.RequestInit, {
      credentials: 'include'
    })
  )
)

export class AppApiClient extends Effect.Service<AppApiClient>()(
  '@radix-vaults/client/AppApiClient',
  {
    scoped: HttpApiClient.make(AppApi, { baseUrl: apiBaseUrl }).pipe(
      Effect.provide(FetchLive)
    )
  }
) {}

export type { VaultListItem, VaultDetail, VaultSigners }
