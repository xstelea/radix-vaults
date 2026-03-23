# Multi-Team Support — Implementation Plan

## Context

Currently single team per deployment — badge address hardcoded in `TEAM_MEMBER_BADGE_ADDRESS` env var. Need: multiple teams, any authenticated user can create teams, users belong to multiple teams. Clean break — fresh DB, no migration.

## Key Decisions (from grilling session)

- **Auth**: ROLA-only login, no badge check. Open to all Radix accounts.
- **Team creation**: Two-step. Creator creates team (1 member), then adds others via proposals.
- **Badge resource owner**: Virtual signature proofs (same pattern as vaults). Access rule lists member keys with N-of-M threshold.
- **Membership tracking**: DB is source of truth (`team_members` table). On-chain verified at write-time.
- **Vault ownership**: Composite PK `(teamId, accountAddress)` — same vault can be in multiple teams.
- **Read access**: Public (any authenticated user). Writes require DB + on-chain membership check.
- **Proposals**: All get `teamId` FK. Add/remove-member proposals include threshold field.
- **Team deletion**: Not supported. Minimum 1 member. Removal always via proposal.
- **NFT data schema**: `(name: String, teamId: String, mfa_virtual_resource: String)`
- **Env vars**: Remove `TEAM_MEMBER_BADGE_ADDRESS`. No new vars.
- **Phasing**: All at once, tests updated as we go.

---

## 1. Database: new tables + FK columns

File: `packages/database/src/schema.ts`

**New `teams` table:**
```
id: uuid PK (default random)
name: varchar(255) NOT NULL
badgeAddress: varchar(255) UNIQUE NOT NULL
createdAt: timestamp with TZ (default now)
```

No `createdBy` — membership tracked in `team_members`.

**New `team_members` table:**
```
teamId: uuid FK → teams.id NOT NULL
accountAddress: varchar(255) NOT NULL
confirmed: boolean NOT NULL DEFAULT false
createdAt: timestamp with TZ (default now)
PK: (teamId, accountAddress)
```

`confirmed` = `false` on proposal creation (optimistic insert), set to `true` when `refresh-status` confirms on-chain commit. Unconfirmed members visible in UI (with "pending" indicator) but don't pass write-op membership checks.

**Modify `vaults` table:**
- Change PK from `accountAddress` to composite `(teamId, accountAddress)`
- Add `teamId: uuid FK → teams.id NOT NULL`

**Modify `proposals` table:**
- Add `teamId: uuid FK → teams.id NOT NULL`

Generate migration via `drizzle-kit generate`. Fresh DB — destructive migration is fine.

---

## 2. Shared types + config

**New**: `packages/shared/src/teamId.ts` — `TeamId` branded type (same pattern as `VaultAddress`)

**Modify**: `packages/shared/src/config.ts`
- Remove `teamMemberBadgeAddress` from `AuthConfig`
- Keep `networkId`, `dAppDefinitionAddress`, `expectedOrigin`

---

## 3. API schema restructure

File: `packages/shared/src/api/index.ts` + `schemas.ts`

**New schemas:**
- `CreateTeamRequestSchema`: `{ name, virtualBadge, memberName }`
- `CreateTeamResponseSchema`: `{ teamId, name, badgeAddress }`
- `TeamListItemSchema`: `{ teamId, name, badgeAddress }`
- `NotATeamMemberError` (403), `TeamNotFoundError` (404)

**New group**: `TeamsGroup` — `POST /teams/create`, `GET /teams` (session required)

**All existing groups get `teamId` path param:**
- `VaultsGroup`: `/teams/:teamId/vaults/...`
- `ProposalsGroup`: `/teams/:teamId/vaults/:vaultAddress/proposals/...`
- `TeamGroup`: `/teams/:teamId/team` (overview)
- `TeamProposalsGroup`: `/teams/:teamId/team/proposals/...`
- `DashboardGroup`: `/teams/:teamId/dashboard/...`

**Remove** `MissingTeamBadgeError` from verify endpoint.

---

## 4. Auth changes

**Modify**: `apps/server/src/api/authHandlers.ts`
- Remove `BadgeChecker.hasBadge()` from `verify` handler
- Session created on successful ROLA only

**Delete**: `apps/server/src/auth/badgeChecker.ts`

**New**: `apps/server/src/auth/teamMembershipChecker.ts`
- `TeamMembershipChecker` Effect.Service
- `check(teamId, accountAddress)`: DB lookup in `team_members` → if found, verify on-chain badge ownership via gateway → fail with `NotATeamMemberError` if either check fails
- Called explicitly in write-op handlers (not middleware)

---

## 5. Team creation flow

**New manifest** in `apps/server/src/gateway/manifests.ts`: `buildCreateTeamBadgeManifest()`

Reuse pattern from `apps/cli/src/manifests.ts` → `buildCreateBadgeResourceManifest()`. Same structure:
- `ALLOCATE_GLOBAL_ADDRESS` for badge resource
- `CREATE_NON_FUNGIBLE_RESOURCE_WITH_INITIAL_SUPPLY` with NFT schema `(name, teamId, mfa_virtual_resource)` — adds `teamId` field to existing 2-field schema (update `nftSchema` SBOR encoding to 3 String fields)
- Mintable/burnable/recallable — all roles = creator's virtual signature badge (1-of-1)
- Initial supply: 1 NFT keyed by creator's virtual badge local ID
- Deposit to fee payer → withdraw to creator's account (same distribution pattern as CLI)
- `CALL_ROLE_ASSIGNMENT_METHOD` to set owner = 1-of-1 access rule

Key difference from CLI: only 1 member (creator) at creation time. Threshold = 1.

**Handler** (`POST /teams/create`):
1. Validate input `{ name, virtualBadge, memberName }`
2. Generate `teamId` UUID
3. Build manifest via `buildCreateTeamBadgeManifest()`
4. `transactionSubmitter.submitFeePayerOnly(manifest)`
5. Extract `resource_` address from `affected_global_entities`
6. Insert into `teams` table
7. Insert into `team_members` table
8. Return `{ teamId, name, badgeAddress }`

---

## 6. Team repo

**New**: `apps/server/src/handlers/teamRepo.ts` — `TeamRepo` Effect.Service
- `insert(name, badgeAddress)` → team record
- `getById(teamId)` → team or `TeamNotFoundError`
- `listByMember(accountAddress)` → `SELECT teams.* FROM teams JOIN team_members ON ... WHERE accountAddress = ?`
- `addMember(teamId, accountAddress)` → insert into `team_members`
- `removeMember(teamId, accountAddress)` → delete from `team_members` (enforce min 1)

---

## 7. Handler modifications

All handlers: replace `authConfig.teamMemberBadgeAddress` with `teamRepo.getById(teamId).badgeAddress`

Key files:
- `apps/server/src/handlers/vaults.ts`: `list(teamId)`, `importVault(teamId, ...)`, `createVault(teamId, ...)`
- `apps/server/src/handlers/team.ts`: `getOverview(teamId)` — badge from DB
- `apps/server/src/handlers/teamProposals.ts`: all methods take `teamId`, badge from DB. Add-member + remove-member proposals include threshold field.
- `apps/server/src/handlers/proposals.ts`: pass `teamId` to repo
- `apps/server/src/handlers/listVaultsRepo.ts`: `WHERE team_id = ?`
- `apps/server/src/handlers/importVaultRepo.ts`: `insert(teamId, address, name)`
- `apps/server/src/handlers/proposalRepo.ts`: add `teamId` to insert + queries

---

## 8. API handler modifications

All team-scoped write handlers: extract `teamId` from path, call `teamMembershipChecker.check()`.

Files:
- `apps/server/src/api/vaultHandlers.ts`
- `apps/server/src/api/teamHandlers.ts`
- `apps/server/src/api/proposalHandlers.ts`
- `apps/server/src/api/teamProposalHandlers.ts`
- `apps/server/src/api/dashboardHandlers.ts`

**New**: `apps/server/src/api/teamsHandlers.ts` — `POST /teams/create`, `GET /teams`

---

## 9. Service wiring

`apps/server/src/main.ts`:
- Add `TeamRepo.Default` to `RepoServicesLive`
- Add `TeamMembershipChecker.Default` to services
- Add `TeamsHandlersLive`
- Remove `BadgeChecker.Default` from `AuthServicesLive`
- `AuthConfig.Live` stays but without `teamMemberBadgeAddress`

---

## 10. Frontend routes

New structure under `apps/client/src/routes/`:
```
index.tsx                          → team list (+ create team button)
teams/
  create.tsx                       → create team form (name, virtualBadge, memberName)
  $teamId.tsx                      → layout (loads team context)
  $teamId/
    index.tsx                      → dashboard (pending proposals for this team)
    vaults/
      index.tsx, add.tsx, create.tsx
      $vaultId/
        index.tsx
        proposals/
          new.tsx, $proposalId.tsx
    team.tsx                       → team layout
    team/
      index.tsx                    → team overview
      add-member.tsx               → add member (includes threshold field)
      remove-member.tsx            → remove member (includes threshold field)
      change-threshold.tsx
      proposals/
        index.tsx, $proposalId.tsx
```

Delete old route files under `routes/vaults/` and `routes/team/`.

Post-create redirect: `/teams/:teamId/team/add-member`

Team switching: navigate to `/` (team list page).

---

## 11. Frontend services

All services get `teamId` parameter. API calls update to `path: { teamId }`.

Files:
- `apps/client/src/services/vault.ts`
- `apps/client/src/services/team.ts`
- `apps/client/src/services/proposal.ts`
- `apps/client/src/services/dashboard.ts`

**New**: `apps/client/src/services/teams.ts` — `listMyTeams()`, `createTeam(name, virtualBadge, memberName)`

---

## 12. Frontend components

- `apps/client/src/components/Sidebar.tsx`: nav links team-scoped, `teamId` from route params
- Root `index.tsx`: team list page (list teams, "Create Team" button). Empty state: just the create button.
- `teams/$teamId.tsx`: team layout, provides `teamId` to children

---

## Verification

1. Fresh DB (drop + recreate)
2. Login with any Radix account (no badge check)
3. See empty team list, click "Create Team"
4. Enter name + virtual badge → team created, badge resource on-chain
5. Redirected to add-member page
6. Add member → proposal created, signed by creator (1-of-1), submitted
7. New member logs in → sees team in list
8. Navigate to `/teams/:teamId/vaults` → import/create vault scoped to team
9. Create second team → separate badge resource, separate vault list
10. Run `pnpm test` — all tests pass

---

## Unresolved Questions

1. **NFT schema SBOR encoding**: Adding `teamId` as a 3rd String field to the NFT data schema requires updating the SBOR type encoding in the manifest. The existing 2-field encoding is in `apps/cli/src/manifests.ts` (lines 192-220). Need to extend to 3 `WellKnown(12)` entries and add `"teamId"` to the field names array. Test on stokenet.

2. **Vault composite PK migration impact**: Changing vault PK from `accountAddress` to `(teamId, accountAddress)` means proposals referencing vaults by `entityAddress` alone may need joins through team context. Need to audit all vault lookups in proposal handlers.
