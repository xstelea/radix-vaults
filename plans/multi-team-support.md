# Plan: Multi-Team Support

> Source PRD: `docs/multi-team-support-implementation-plan.md`

## Architectural decisions

- **Routes**: Top-level `POST /teams/create`, `GET /teams`. All other groups nested under `/teams/:teamId/...` (`/teams/:teamId/vaults/...`, `/teams/:teamId/team/...`, `/teams/:teamId/dashboard/...`)
- **Schema**: New `teams` table (id, name, badgeAddress, createdAt). New `team_members` table (teamId + accountAddress composite PK, confirmed boolean). Vault PK becomes `(teamId, accountAddress)`. Proposals get `teamId` FK.
- **Auth**: ROLA-only login — no badge check at session creation. Write-op membership enforced per-handler via `TeamMembershipChecker` (DB lookup + on-chain badge verification).
- **Badge ownership**: Each team gets its own on-chain non-fungible badge resource. Address stored in `teams.badgeAddress`, not env var.
- **NFT data schema**: 3-field SBOR struct `(name: String, teamId: String, mfa_virtual_resource: String)`
- **Read access**: Public (any authenticated user). Writes require confirmed team membership.
- **Team deletion**: Not supported. Minimum 1 member enforced.

---

## Phase 1: Auth simplification

**User stories**: Any Radix account can log in without holding a team badge.

### What to build

Remove the badge ownership check from the login flow. Currently `POST /auth/verify` calls `BadgeChecker.hasBadge()` after ROLA verification — remove that call so a successful ROLA signature alone creates a session. The `BadgeChecker` service stays wired for now (cleanup is phase 8). Remove `MissingTeamBadgeError` from the verify endpoint's error schema.

On the frontend, remove any UI that shows the "missing badge" error state during login.

### Acceptance criteria

- [x] `POST /auth/verify` succeeds with valid ROLA signature regardless of badge ownership
- [x] `MissingTeamBadgeError` no longer in verify endpoint schema
- [x] Frontend login flow works for accounts without any badges
- [x] Existing session/logout behavior unchanged
- [x] Tests updated — no tests asserted on badge checking; all 36 pass

---

## Phase 2: Team creation

**User stories**: Authenticated user can create a team, which mints an on-chain badge resource and records the team in the database. User sees their teams in a list.

### What to build

**Database**: Add `teams` and `team_members` tables. Generate migration (fresh DB, destructive is fine).

**API**: New `TeamsGroup` with `POST /teams/create` and `GET /teams` (both session-required). Create team accepts `{ name, virtualBadge, memberName }`, returns `{ teamId, name, badgeAddress }`. List returns teams where the session's account is a member.

**Manifest**: `buildCreateTeamBadgeManifest()` — same pattern as existing `buildCreateBadgeResourceManifest()` from CLI but with 3-field NFT schema (adds `teamId`), 1 member (creator), threshold 1. Submit via `transactionSubmitter.submitFeePayerOnly()`, extract `resource_` address from `affected_global_entities`.

**Handler**: `TeamRepo` service for DB operations (insert team, add member, list by member). Creation handler orchestrates: validate input, generate UUID, build manifest, submit transaction, extract badge address, insert team + member records.

**Frontend**: Team list page at `/` (replaces current home). Create team page at `/teams/create`. After creation, redirect to team context. Empty state: just the create button.

### Acceptance criteria

- [x] `teams` and `team_members` tables exist with correct schema
- [x] `POST /teams/create` mints badge on-chain and inserts team + member in DB
- [x] `GET /teams` returns teams where current user is a member
- [x] Team list page renders teams and "Create Team" button
- [x] Create team form submits successfully and redirects
- [ ] Badge resource visible on-chain (stokenet) after creation
- [x] `TeamRepo` service wired into server

---

## Phase 3: Team-scoped routing

**User stories**: User selects a team from the list and enters a team-scoped view. All existing features (vaults, proposals, team management) are accessed within team context.

### What to build

**Schema migration**: Add `teamId` FK (NOT NULL) to `vaults` table. Change vault PK to composite `(teamId, accountAddress)`. Add `teamId` FK (NOT NULL) to `proposals` table.

**API restructure**: Add `teamId` path param to all existing groups — `VaultsGroup`, `ProposalsGroup`, `TeamGroup`, `TeamProposalsGroup`, `DashboardGroup`. URL paths become `/teams/:teamId/vaults/...`, `/teams/:teamId/team/...`, etc.

**TeamMembershipChecker**: New Effect.Service. `check(teamId, accountAddress)` does DB lookup in `team_members` (confirmed = true) then verifies on-chain badge ownership via gateway. Called in write-op handlers (not middleware).

**Frontend**: New `$teamId.tsx` layout route that loads team context and provides `teamId` to children. Sidebar nav links use team-scoped paths. All frontend services gain `teamId` parameter. All API calls update path params.

**Repos**: All repo methods that touch vaults or proposals gain `teamId` parameter for inserts and queries.

### Acceptance criteria

- [x] All API endpoints under `/teams/:teamId/...` accept and validate `teamId` path param
- [x] `TeamMembershipChecker` blocks write operations for non-members
- [x] Read operations accessible to any authenticated user
- [x] Vault and proposal DB operations scoped to `teamId`
- [x] Frontend navigates from team list into team-scoped layout
- [x] Sidebar links are team-scoped
- [x] All existing tests updated for team-scoped routes

---

## Phase 4: Team-scoped vault operations

**User stories**: User imports or creates a vault within a team. User creates, signs, submits, and tracks vault proposals within team context.

### What to build

Wire up the team-scoped vault and proposal flows end-to-end. Vault import/create handlers use `teamId` from path — vault records stored with `(teamId, accountAddress)`. Vault list filtered by `teamId`. Vault detail and signers fetched within team context.

Proposal creation, listing, detail, signing, submission, and status refresh all pass `teamId` through to repos and manifest builders. The badge address for manifests comes from `teamRepo.getById(teamId).badgeAddress` instead of `authConfig.teamMemberBadgeAddress`.

Frontend vault pages (list, import, create, detail) and proposal pages (new, detail with sign/submit) all use `teamId` from route params.

### Acceptance criteria

- [x] Import vault within team stores `(teamId, accountAddress)` record
- [x] Create vault within team links vault to team
- [x] Vault list shows only vaults belonging to current team
- [x] Create proposal uses badge address from team DB record
- [x] Sign, submit, refresh-status work within team context
- [x] Full vault proposal lifecycle works end-to-end within a team
- [x] Same vault address can exist in multiple teams independently

---

## Phase 5: Team governance — add member

**User stories**: Team creator views team overview (signers, threshold). Team creator proposes adding a new member. New member confirms on-chain and appears in team.

### What to build

**Team overview**: Team overview page within team-scoped layout. Badge address, threshold, and signers fetched from DB + gateway using `teamRepo.getById(teamId).badgeAddress`. No longer reads from env var.

**Add member flow**: Add-member proposal creation within team context — includes threshold field. Manifest built using team's badge address from DB. After proposal is signed and submitted, `team_members` record inserted with `confirmed = false`. When `refresh-status` detects on-chain commit, flip `confirmed = true`.

**Team proposals infrastructure**: Team proposals list and detail pages within team-scoped routes. Sign, submit, refresh-status handlers scoped to team.

**Post-create redirect**: After team creation (phase 2), redirect to `/teams/:teamId/team/add-member`.

### Acceptance criteria

- [x] Team overview shows signers, threshold, badge info from DB (not env var)
- [x] Add-member proposal created with threshold field
- [x] Unconfirmed member visible in UI with "pending" indicator
- [x] `refresh-status` flips `confirmed` to `true` after on-chain commit
- [x] Confirmed member can log in and see team in their team list
- [x] Team proposals list/detail/sign/submit work within team context
- [x] Post-team-creation redirects to add-member page

---

## Phase 6: Team governance — remove member + change threshold

**User stories**: Team member proposes removing another member. Team member proposes changing the signing threshold.

### What to build

**Remove member**: Remove-member proposal creation within team context — includes threshold field. Manifest built using team's badge address. On successful on-chain commit, `refresh-status` deletes `team_members` record. Enforce minimum 1 member (reject proposal that would remove last member).

**Change threshold**: Change-threshold proposal creation within team context. Updates threshold on badge resource and all team vaults.

Frontend pages for both flows within team-scoped routes. Reuses team proposals infrastructure from phase 5.

### Acceptance criteria

- [x] Remove-member proposal created with threshold field
- [x] `refresh-status` removes member record after on-chain commit
- [x] Cannot remove last member of a team
- [x] Change-threshold proposal updates badge + vault access rules
- [x] Both proposal types visible in team proposals list
- [x] Full sign/submit/refresh lifecycle for both proposal types

---

## Phase 7: Team-scoped dashboard

**User stories**: User sees pending proposals across all vaults and team governance for the current team.

### What to build

Dashboard endpoint and page scoped to `teamId`. Shows pending vault proposals and pending team proposals for the current team. Replaces the existing flat dashboard.

### Acceptance criteria

- [x] `GET /teams/:teamId/dashboard/pending-proposals` returns team-scoped results
- [x] Dashboard page shows pending vault + team proposals for current team
- [x] Dashboard accessible from team-scoped sidebar

---

## Phase 8: Cleanup

**User stories**: Legacy single-team code removed. No env var configuration needed for team membership.

### What to build

Remove `BadgeChecker` service and its wiring from `AuthServicesLive`. Remove `teamMemberBadgeAddress` from `AuthConfig`. Remove `TEAM_MEMBER_BADGE_ADDRESS` env var from config, `.env` files, and documentation. Delete old flat route files (`routes/vaults/`, `routes/team/`) if not already replaced. Remove any dead code paths that reference the old single-team pattern.

### Acceptance criteria

- [x] `BadgeChecker` service deleted
- [x] `TEAM_MEMBER_BADGE_ADDRESS` env var removed from all config
- [x] `AuthConfig` no longer includes `teamMemberBadgeAddress`
- [x] No references to old flat routes remain
- [x] `pnpm test` passes
- [x] `pnpm typecheck` passes
