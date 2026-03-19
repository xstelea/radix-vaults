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
  RolaVerificationFailedError,
  SessionInfoSchema,
  VerifyRequestSchema
} from '../auth'
import { ProposalId } from '../proposalId'
import { TeamId } from '../teamId'
import { VaultAddress } from '../vaultAddress'
import {
  AddMemberRequestSchema,
  AlreadySignedError,
  BadgeVaultNotFoundError,
  ChangeThresholdRequestSchema,
  CreateProposalRequestSchema,
  CreateProposalResponseSchema,
  CreateTeamFailedError,
  CreateTeamRequestSchema,
  CreateTeamResponseSchema,
  CreateVaultFailedError,
  CreateVaultRequestSchema,
  CreateVaultResponseSchema,
  ImportVaultRequestSchema,
  ImportVaultResponseSchema,
  MemberAlreadyExistsError,
  MemberNotFoundError,
  NotATeamMemberError,
  NotEligibleSignerError,
  PendingProposalListItemSchema,
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
  RemoveMemberRequestSchema,
  SignProposalRequestSchema,
  SignProposalResponseSchema,
  SubmitProposalResponseSchema,
  TeamListItemSchema,
  TeamNotFoundError,
  TeamOverviewSchema,
  TeamProposalCreateResponseSchema,
  TeamProposalDetailSchema,
  TeamProposalListItemSchema,
  TeamProposalNotFoundError,
  ThresholdExceedsSignersError,
  UnsupportedAccessRuleError,
  VaultAlreadyExistsError,
  VaultDetailSchema,
  VaultListItemSchema,
  VaultNotFoundError,
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

// --- Shared path schemas ---
const TeamPath = Schema.Struct({ teamId: TeamId })
const TeamVaultPath = Schema.Struct({
  teamId: TeamId,
  vaultAddress: VaultAddress
})
const TeamVaultProposalPath = Schema.Struct({
  teamId: TeamId,
  vaultAddress: VaultAddress,
  proposalId: Schema.NumberFromString.pipe(Schema.brand('ProposalId'))
})
const TeamProposalPath = Schema.Struct({
  teamId: TeamId,
  proposalId: Schema.NumberFromString.pipe(Schema.brand('ProposalId'))
})

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

// --- Vault endpoints (team-scoped) ---
export class VaultsGroup extends HttpApiGroup.make('vaults')
  .add(
    HttpApiEndpoint.get('list', '/teams/:teamId/vaults')
      .setPath(TeamPath)
      .addSuccess(Schema.Array(VaultListItemSchema))
      .addError(TeamNotFoundError)
  )
  .add(
    HttpApiEndpoint.get('detail', '/teams/:teamId/vaults/:vaultAddress')
      .setPath(TeamVaultPath)
      .addSuccess(VaultDetailSchema)
      .addError(TeamNotFoundError)
      .addError(VaultNotFoundError, { status: 404 })
  )
  .add(
    HttpApiEndpoint.get(
      'signers',
      '/teams/:teamId/vaults/:vaultAddress/signers'
    )
      .setPath(TeamVaultPath)
      .addSuccess(VaultSignersSchema)
      .addError(TeamNotFoundError)
      .addError(VaultNotFoundError, { status: 404 })
  )
  .add(
    HttpApiEndpoint.post('importVault', '/teams/:teamId/vaults/import')
      .setPath(TeamPath)
      .setPayload(ImportVaultRequestSchema)
      .addSuccess(ImportVaultResponseSchema)
      .addError(TeamNotFoundError)
      .addError(NotATeamMemberError)
      .addError(UnsupportedAccessRuleError)
      .addError(VaultAlreadyExistsError)
      .middleware(SessionMiddleware)
  )
  .add(
    HttpApiEndpoint.post('createVault', '/teams/:teamId/vaults/create')
      .setPath(TeamPath)
      .setPayload(CreateVaultRequestSchema)
      .addSuccess(CreateVaultResponseSchema)
      .addError(TeamNotFoundError)
      .addError(NotATeamMemberError)
      .addError(CreateVaultFailedError)
      .addError(ThresholdExceedsSignersError)
      .middleware(SessionMiddleware)
  ) {}

// --- Team endpoints (team-scoped) ---
export class TeamGroup extends HttpApiGroup.make('team').add(
  HttpApiEndpoint.get('overview', '/teams/:teamId/team')
    .setPath(TeamPath)
    .addSuccess(TeamOverviewSchema)
    .addError(TeamNotFoundError)
) {}

// --- Proposal endpoints (team-scoped) ---
export class ProposalsGroup extends HttpApiGroup.make('proposals')
  .add(
    HttpApiEndpoint.post(
      'create',
      '/teams/:teamId/vaults/:vaultAddress/proposals'
    )
      .setPath(TeamVaultPath)
      .setPayload(CreateProposalRequestSchema)
      .addSuccess(CreateProposalResponseSchema)
      .addError(TeamNotFoundError)
      .addError(NotATeamMemberError)
      .addError(VaultNotFoundError, { status: 404 })
      .addError(ProposalPreviewFailedError)
      .middleware(SessionMiddleware)
  )
  .add(
    HttpApiEndpoint.get('list', '/teams/:teamId/vaults/:vaultAddress/proposals')
      .setPath(TeamVaultPath)
      .addSuccess(Schema.Array(ProposalListItemSchema))
      .addError(TeamNotFoundError)
      .addError(VaultNotFoundError, { status: 404 })
  )
  .add(
    HttpApiEndpoint.get(
      'detail',
      '/teams/:teamId/vaults/:vaultAddress/proposals/:proposalId'
    )
      .setPath(TeamVaultProposalPath)
      .addSuccess(ProposalDetailSchema)
      .addError(TeamNotFoundError)
      .addError(VaultNotFoundError, { status: 404 })
      .addError(ProposalNotFoundError)
  )
  .add(
    HttpApiEndpoint.post(
      'sign',
      '/teams/:teamId/vaults/:vaultAddress/proposals/:proposalId/sign'
    )
      .setPath(TeamVaultProposalPath)
      .setPayload(SignProposalRequestSchema)
      .addSuccess(SignProposalResponseSchema)
      .addError(TeamNotFoundError)
      .addError(NotATeamMemberError)
      .addError(VaultNotFoundError, { status: 404 })
      .addError(ProposalNotFoundError)
      .addError(ProposalNotSignableError)
      .addError(ProposalExpiredError)
      .addError(NotEligibleSignerError)
      .addError(AlreadySignedError)
      .middleware(SessionMiddleware)
  )
  .add(
    HttpApiEndpoint.post(
      'submit',
      '/teams/:teamId/vaults/:vaultAddress/proposals/:proposalId/submit'
    )
      .setPath(TeamVaultProposalPath)
      .addSuccess(SubmitProposalResponseSchema)
      .addError(TeamNotFoundError)
      .addError(NotATeamMemberError)
      .addError(VaultNotFoundError, { status: 404 })
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
      '/teams/:teamId/vaults/:vaultAddress/proposals/:proposalId/refresh-status'
    )
      .setPath(TeamVaultProposalPath)
      .addSuccess(RefreshStatusResponseSchema)
      .addError(TeamNotFoundError)
      .addError(NotATeamMemberError)
      .addError(VaultNotFoundError, { status: 404 })
      .addError(ProposalNotFoundError)
      .addError(ProposalNotSubmittedError)
      .addError(ProposalStatusCheckFailedError)
      .middleware(SessionMiddleware)
  ) {}

// --- Team proposal endpoints (team-scoped) ---
export class TeamProposalsGroup extends HttpApiGroup.make('teamProposals')
  .add(
    HttpApiEndpoint.post(
      'addMember',
      '/teams/:teamId/team/proposals/add-member'
    )
      .setPath(TeamPath)
      .setPayload(AddMemberRequestSchema)
      .addSuccess(TeamProposalCreateResponseSchema)
      .addError(TeamNotFoundError)
      .addError(NotATeamMemberError)
      .addError(ProposalPreviewFailedError)
      .addError(MemberAlreadyExistsError)
      .addError(ThresholdExceedsSignersError)
      .addError(VaultNotFoundError, { status: 404 })
      .middleware(SessionMiddleware)
  )
  .add(
    HttpApiEndpoint.post(
      'removeMember',
      '/teams/:teamId/team/proposals/remove-member'
    )
      .setPath(TeamPath)
      .setPayload(RemoveMemberRequestSchema)
      .addSuccess(TeamProposalCreateResponseSchema)
      .addError(TeamNotFoundError)
      .addError(NotATeamMemberError)
      .addError(ProposalPreviewFailedError)
      .addError(MemberNotFoundError)
      .addError(BadgeVaultNotFoundError)
      .addError(ThresholdExceedsSignersError)
      .addError(VaultNotFoundError, { status: 404 })
      .middleware(SessionMiddleware)
  )
  .add(
    HttpApiEndpoint.post(
      'changeThreshold',
      '/teams/:teamId/team/proposals/change-threshold'
    )
      .setPath(TeamPath)
      .setPayload(ChangeThresholdRequestSchema)
      .addSuccess(TeamProposalCreateResponseSchema)
      .addError(TeamNotFoundError)
      .addError(NotATeamMemberError)
      .addError(ProposalPreviewFailedError)
      .addError(VaultNotFoundError, { status: 404 })
      .addError(ThresholdExceedsSignersError)
      .middleware(SessionMiddleware)
  )
  .add(
    HttpApiEndpoint.get('list', '/teams/:teamId/team/proposals')
      .setPath(TeamPath)
      .addSuccess(Schema.Array(TeamProposalListItemSchema))
      .addError(TeamNotFoundError)
  )
  .add(
    HttpApiEndpoint.get('detail', '/teams/:teamId/team/proposals/:proposalId')
      .setPath(TeamProposalPath)
      .addSuccess(TeamProposalDetailSchema)
      .addError(TeamNotFoundError)
      .addError(TeamProposalNotFoundError)
  )
  .add(
    HttpApiEndpoint.post(
      'sign',
      '/teams/:teamId/team/proposals/:proposalId/sign'
    )
      .setPath(TeamProposalPath)
      .setPayload(SignProposalRequestSchema)
      .addSuccess(SignProposalResponseSchema)
      .addError(TeamNotFoundError)
      .addError(NotATeamMemberError)
      .addError(TeamProposalNotFoundError)
      .addError(ProposalNotSignableError)
      .addError(ProposalExpiredError)
      .addError(NotEligibleSignerError)
      .addError(AlreadySignedError)
      .middleware(SessionMiddleware)
  )
  .add(
    HttpApiEndpoint.post(
      'submit',
      '/teams/:teamId/team/proposals/:proposalId/submit'
    )
      .setPath(TeamProposalPath)
      .addSuccess(SubmitProposalResponseSchema)
      .addError(TeamNotFoundError)
      .addError(NotATeamMemberError)
      .addError(TeamProposalNotFoundError)
      .addError(ProposalNotReadyError)
      .addError(ProposalExpiredError)
      .addError(ProposalInvalidError)
      .addError(ProposalSubmitFailedError)
      .middleware(SessionMiddleware)
  )
  .add(
    HttpApiEndpoint.post(
      'refreshStatus',
      '/teams/:teamId/team/proposals/:proposalId/refresh-status'
    )
      .setPath(TeamProposalPath)
      .addSuccess(RefreshStatusResponseSchema)
      .addError(TeamNotFoundError)
      .addError(NotATeamMemberError)
      .addError(TeamProposalNotFoundError)
      .addError(ProposalNotSubmittedError)
      .addError(ProposalStatusCheckFailedError)
      .middleware(SessionMiddleware)
  ) {}

// --- Teams endpoints (top-level, not team-scoped) ---
export class TeamsGroup extends HttpApiGroup.make('teams')
  .add(
    HttpApiEndpoint.post('createTeam', '/teams/create')
      .setPayload(CreateTeamRequestSchema)
      .addSuccess(CreateTeamResponseSchema)
      .addError(CreateTeamFailedError)
      .middleware(SessionMiddleware)
  )
  .add(
    HttpApiEndpoint.get('list', '/teams')
      .addSuccess(Schema.Array(TeamListItemSchema))
      .middleware(SessionMiddleware)
  ) {}

// --- Dashboard endpoints (team-scoped) ---
export class DashboardGroup extends HttpApiGroup.make('dashboard').add(
  HttpApiEndpoint.get(
    'pendingProposals',
    '/teams/:teamId/dashboard/pending-proposals'
  )
    .setPath(TeamPath)
    .addSuccess(Schema.Array(PendingProposalListItemSchema))
    .addError(TeamNotFoundError)
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
  .add(TeamsGroup)
  .add(ProposalsGroup)
  .add(TeamProposalsGroup)
  .add(DashboardGroup)
  .add(HealthGroup) {}
