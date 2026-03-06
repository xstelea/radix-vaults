import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity
} from '@effect/platform'
import { AccountAddress } from '@radix-effects/shared'
import { Context, Schema } from 'effect'
import {
  InvalidOrExpiredChallengeError,
  MissingTeamBadgeError,
  RolaVerificationFailedError,
  SessionInfoSchema,
  VerifyRequestSchema
} from '../auth'
import { VaultAddress } from '../vaultAddress'
import {
  VaultDetailSchema,
  VaultListItemSchema,
  VaultNotFoundErrorSchema,
  VaultSignersSchema
} from './schemas'

export * from './schemas'

// --- Security (for securitySetCookie only) ---
export const sessionCookie = HttpApiSecurity.apiKey({
  in: 'cookie',
  key: 'radix_vault_session'
})

// --- Middleware ---
export class CurrentSession extends Context.Tag('CurrentSession')<
  CurrentSession,
  {
    readonly sessionId: string
    readonly accountAddress: typeof AccountAddress.Type
  }
>() {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  'Unauthorized',
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 401 })
) {}

export class SessionMiddleware extends HttpApiMiddleware.Tag<SessionMiddleware>()(
  'SessionMiddleware',
  {
    provides: CurrentSession,
    failure: Unauthorized
  }
) {}

// --- Auth endpoints ---
export class AuthGroup extends HttpApiGroup.make('auth')
  .add(
    HttpApiEndpoint.get('createChallenge', '/auth/challenge').addSuccess(
      Schema.Struct({ challenge: Schema.String })
    )
  )
  .add(
    HttpApiEndpoint.post('verify', '/auth/verify')
      .setPayload(VerifyRequestSchema)
      .addSuccess(SessionInfoSchema)
      .addError(InvalidOrExpiredChallengeError)
      .addError(RolaVerificationFailedError)
      .addError(MissingTeamBadgeError)
  )
  .add(
    HttpApiEndpoint.get('getSession', '/auth/session')
      .addSuccess(Schema.Struct({ accountAddress: AccountAddress }))
      .middleware(SessionMiddleware)
  )
  .add(
    HttpApiEndpoint.post('logout', '/auth/logout')
      .addSuccess(Schema.Struct({ ok: Schema.Boolean }))
      .middleware(SessionMiddleware)
  ) {}

// --- Vault endpoints ---
export class VaultsGroup extends HttpApiGroup.make('vaults')
  .add(
    HttpApiEndpoint.get('list', '/vaults').addSuccess(
      Schema.Array(VaultListItemSchema)
    )
  )
  .add(
    HttpApiEndpoint.get('detail', '/vaults/:vaultAddress')
      .setPath(Schema.Struct({ vaultAddress: VaultAddress }))
      .addSuccess(VaultDetailSchema)
      .addError(VaultNotFoundErrorSchema, { status: 404 })
  )
  .add(
    HttpApiEndpoint.get('signers', '/vaults/:vaultAddress/signers')
      .setPath(Schema.Struct({ vaultAddress: VaultAddress }))
      .addSuccess(VaultSignersSchema)
      .addError(VaultNotFoundErrorSchema, { status: 404 })
  ) {}

// --- Health endpoint ---
export class HealthGroup extends HttpApiGroup.make('health').add(
  HttpApiEndpoint.get('check', '/health').addSuccess(
    Schema.Struct({ status: Schema.String })
  )
) {}

// --- Combined API ---
export class AppApi extends HttpApi.make('radix-vaults')
  .add(AuthGroup)
  .add(VaultsGroup)
  .add(HealthGroup) {}
