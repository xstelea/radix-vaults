import { FetchHttpClient, HttpApiClient } from '@effect/platform'
import {
  AppApi,
  type VaultDetail,
  type VaultListItem,
  type VaultSigners
} from '@radix-vaults/shared'
import { Effect } from 'effect'
import { envVars } from './envVars'

const apiBaseUrl = envVars.API_BASE_URL

export class AppApiClient extends Effect.Service<AppApiClient>()(
  '@radix-vaults/client/AppApiClient',
  {
    scoped: HttpApiClient.make(AppApi, { baseUrl: apiBaseUrl }).pipe(
      Effect.provide(FetchHttpClient.layer)
    )
  }
) {}

export type { VaultListItem, VaultDetail, VaultSigners }
