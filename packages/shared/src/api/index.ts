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
  AlreadySignedError,
  CreateProposalRequestSchema,
  CreateProposalResponseSchema,
  ImportVaultRequestSchema,
  ImportVaultResponseSchema,
  NotEligibleSignerError,
  ProposalDetailSchema,
  ProposalExpiredError,
  ProposalInvalidError,
  ProposalListItemSchema,
  ProposalNotFoundError,
  ProposalNotReadyError,
  ProposalNotSignableError,
  ProposalNotSubmittedError,
  ProposalPreviewFailedError,
  ProposalStatusCheckFailedError,
  ProposalSubmitFailedError,
  RefreshStatusResponseSchema,
  SetSignerSourceRequestSchema,
  SetSignerSourceResponseSchema,
  SignerSourceMissingError,
  SignProposalResponseSchema,
  SubmitProposalResponseSchema,
  TeamOverviewSchema,
  UnsupportedAccessRuleError,
  VaultAlreadyExistsError,
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
  )
  .add(
    HttpApiEndpoint.post('importVault', '/vaults/import')
      .setPayload(ImportVaultRequestSchema)
      .addSuccess(ImportVaultResponseSchema)
      .addError(UnsupportedAccessRuleError)
      .addError(VaultAlreadyExistsError)
      .middleware(SessionMiddleware)
  ) {}

// --- Team endpoints ---
export class TeamGroup extends HttpApiGroup.make('team')
  .add(HttpApiEndpoint.get('overview', '/team').addSuccess(TeamOverviewSchema))
  .add(
    HttpApiEndpoint.put('setSignerSource', '/team/signer-source')
      .setPayload(SetSignerSourceRequestSchema)
      .addSuccess(SetSignerSourceResponseSchema)
      .middleware(SessionMiddleware)
  )
  .add(
    HttpApiEndpoint.del('clearSignerSource', '/team/signer-source')
      .addSuccess(Schema.Struct({ ok: Schema.Boolean }))
      .middleware(SessionMiddleware)
  ) {}

// --- Proposal endpoints ---
export class ProposalsGroup extends HttpApiGroup.make('proposals')
  .add(
    HttpApiEndpoint.post('create', '/vaults/:vaultAddress/proposals')
      .setPath(Schema.Struct({ vaultAddress: VaultAddress }))
      .setPayload(CreateProposalRequestSchema)
      .addSuccess(CreateProposalResponseSchema)
      .addError(VaultNotFoundErrorSchema, { status: 404 })
      .addError(ProposalPreviewFailedError)
      .middleware(SessionMiddleware)
  )
  .add(
    HttpApiEndpoint.get('list', '/vaults/:vaultAddress/proposals')
      .setPath(Schema.Struct({ vaultAddress: VaultAddress }))
      .addSuccess(Schema.Array(ProposalListItemSchema))
      .addError(VaultNotFoundErrorSchema, { status: 404 })
  )
  .add(
    HttpApiEndpoint.get('detail', '/vaults/:vaultAddress/proposals/:proposalId')
      .setPath(
        Schema.Struct({
          vaultAddress: VaultAddress,
          proposalId: Schema.NumberFromString
        })
      )
      .addSuccess(ProposalDetailSchema)
      .addError(VaultNotFoundErrorSchema, { status: 404 })
      .addError(ProposalNotFoundError)
  )
  .add(
    HttpApiEndpoint.post(
      'sign',
      '/vaults/:vaultAddress/proposals/:proposalId/sign'
    )
      .setPath(
        Schema.Struct({
          vaultAddress: VaultAddress,
          proposalId: Schema.NumberFromString
        })
      )
      .addSuccess(SignProposalResponseSchema)
      .addError(VaultNotFoundErrorSchema, { status: 404 })
      .addError(ProposalNotFoundError)
      .addError(ProposalNotSignableError)
      .addError(ProposalExpiredError)
      .addError(SignerSourceMissingError)
      .addError(NotEligibleSignerError)
      .addError(AlreadySignedError)
      .middleware(SessionMiddleware)
  )
  .add(
    HttpApiEndpoint.post(
      'submit',
      '/vaults/:vaultAddress/proposals/:proposalId/submit'
    )
      .setPath(
        Schema.Struct({
          vaultAddress: VaultAddress,
          proposalId: Schema.NumberFromString
        })
      )
      .addSuccess(SubmitProposalResponseSchema)
      .addError(VaultNotFoundErrorSchema, { status: 404 })
      .addError(ProposalNotFoundError)
      .addError(ProposalNotReadyError)
      .addError(ProposalExpiredError)
      .addError(ProposalInvalidError)
      .addError(ProposalSubmitFailedError)
      .middleware(SessionMiddleware)
  )
  .add(
    HttpApiEndpoint.post(
      'refreshStatus',
      '/vaults/:vaultAddress/proposals/:proposalId/refresh-status'
    )
      .setPath(
        Schema.Struct({
          vaultAddress: VaultAddress,
          proposalId: Schema.NumberFromString
        })
      )
      .addSuccess(RefreshStatusResponseSchema)
      .addError(VaultNotFoundErrorSchema, { status: 404 })
      .addError(ProposalNotFoundError)
      .addError(ProposalNotSubmittedError)
      .addError(ProposalStatusCheckFailedError)
      .middleware(SessionMiddleware)
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
  .add(TeamGroup)
  .add(ProposalsGroup)
  .add(HealthGroup) {}
