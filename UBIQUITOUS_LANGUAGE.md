# Ubiquitous Language

## Teams & Membership

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Team** | A named multi-signer group identified by a UUID, owning a badge resource and a set of vaults | Group, org, multisig |
| **Team Member** | A Radix account address associated with a Team, either confirmed or pending | Participant, user |
| **Pending Member** | A Team Member with `confirmed = false` whose add-member proposal has not yet committed | Unconfirmed member |
| **Badge Holder** | A confirmed Team Member whose account holds a Badge NFT on-chain | Active member, verified member |
| **Threshold** | The minimum number of signers required to authorize a transaction on a specific entity (badge resource or vault) | Quorum, required signatures |

## Vaults

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Vault** | A Radix account controlled by a multisig access rule, belonging to exactly one Team | Multisig account, safe, treasury |
| **Vault Address** | The on-chain component address of a Vault (e.g., `account_tdx_2_...`) | Account address (ambiguous with member accounts) |
| **XRD Balance** | The amount of native XRD tokens held by a Vault, displayed as a summary metric | Balance, funds |

## Proposals

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Proposal** | An off-chain record representing a pending multisig transaction awaiting signatures | Transaction, request, action |
| **Vault Proposal** | A Proposal executing a user-authored manifest against a specific Vault | Custom transaction |
| **Team Proposal** | A Proposal reconfiguring team membership or thresholds using a system-generated manifest | Admin proposal, management proposal |
| **Add-Member Proposal** | A Team Proposal that mints a Badge NFT, deposits it to a recipient, and updates access rules on badge resource and all vaults | Invite |
| **Remove-Member Proposal** | A Team Proposal that recalls and burns a member's Badge NFT and updates access rules | Revoke, kick |
| **Change-Threshold Proposal** | A Team Proposal that updates the owner role threshold on a single vault | Threshold update |
| **Signature Progress** | A derived value on a Proposal: `{ collected, required, signatures }` showing how many signatures have been gathered vs. the threshold | Signing status |

### Proposal Status (state machine)

| Status | Definition | Aliases to avoid |
|--------|-----------|-----------------|
| **Created** | Initial state; zero signatures collected | New, draft |
| **Signing** | At least one signature collected but threshold not met | In progress, partially signed |
| **Ready** | Threshold met; can be submitted to the ledger | Complete, fully signed |
| **Submitted** | Transaction sent to the Gateway; awaiting ledger commit | Pending, processing |
| **Committed** | Transaction confirmed on-chain with `CommittedSuccess` | Confirmed, finalized |
| **Failed** | Transaction rejected or committed with failure on-chain | Rejected, error |
| **Expired** | `maxProposerTimestamp` passed before the proposal could be submitted | Timed out |
| **Invalid** | At submit time, threshold drift detected — collected signatures no longer meet the required count | Stale |

Status groups:
- **Pending statuses**: Created, Signing, Ready
- **Terminal statuses**: Committed, Failed, Expired, Invalid
- **Signable statuses**: Created, Signing

## Badges & Identity

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Badge Resource** | A non-fungible resource on-chain that gates Team membership; its owner role is a multisig access rule | Team badge, badge address, badge contract |
| **Badge NFT** | An individual non-fungible token minted from the Badge Resource, one per Team Member | Badge, token, membership token |
| **Virtual Badge** | A system `NonFungibleGlobalId` representing a cryptographic key — not a real stored NFT; used in access rules to require signatures | Signature badge, key badge |
| **Public Key Hash** | The last 29 bytes of blake2b-32 of a public key; used as the `NonFungibleLocalId` for Virtual Badges and as the signer identifier | Key hash, signer hash |

## Access Control

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Access Rule** | The on-chain authorization policy protecting an entity's owner role; either `CountOf(count, signers)` or `AllOf(signers)` | Auth rule, permission, policy |
| **Parsed Signer** | A minimal parsed entry from an Access Rule: `{ resourceAddress, localId }` identifying one Virtual Badge | Signer entry |
| **Owner Role** | The Radix role assignment on a component or resource that controls privileged operations including `set_owner` | Admin role, authority |
| **Fee Payer** | A server-held Radix account that pays transaction fees for vault creation, team creation, and proposal submission | Gas payer, relayer |

## Transactions & Cryptography

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Manifest** | A textual script in the Radix instruction language (e.g., `CALL_METHOD`, `SET_OWNER_ROLE`) describing a transaction's operations | Script, instructions, transaction body |
| **Subintent** | A Radix V2 transaction primitive: a self-contained portion of a multi-party transaction with its own header, manifest (ending in `YIELD_TO_PARENT`), and hash | Partial intent |
| **Partial Transaction** | The unsigned Subintent serialized to hex; stored with the Proposal | Raw transaction, unsigned transaction |
| **Signed Partial Transaction** | The wallet's response after signing a Subintent — the Partial Transaction with root subintent signatures attached | Signed subintent |
| **Subintent Hash** | A deterministic hash of the unsigned Partial Transaction; used to verify correct signing | Transaction hash (ambiguous) |
| **Intent Discriminator** | A random integer in the subintent header ensuring uniqueness even with identical manifest and epoch bounds | Nonce (ambiguous with Challenge) |
| **Transaction Intent** | The full Radix V2 transaction assembled at submission from: root manifest + child Subintent + collected signatures | Final transaction |
| **Intent Hash** | The hash of a committed Transaction Intent; links to the Radix Dashboard for verification | Transaction ID, tx hash |
| **Epoch** | A Radix ledger time unit (~5 minutes); used to set validity bounds on Subintents | Block, round |
| **Max Proposer Timestamp** | A UTC datetime limiting when a validator may include a transaction; doubles as the Proposal's wall-clock expiry | Expiry, deadline |

## Authentication

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **ROLA** | Radix Off-Ledger Authentication — the protocol where the wallet signs a server-issued Challenge to prove account ownership | Auth flow, login |
| **Challenge** | A cryptographic nonce generated by the server for ROLA verification | Auth token, login code |
| **Signed Challenge** | The wallet's auth response containing address, challenge hex, and cryptographic proof | Auth proof, login response |
| **Session** | A server-side authenticated state linking an account address to an expiry timestamp | Login session, auth session |

## Network & Infrastructure

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **dApp Definition Address** | A Radix account address identifying this application on-chain; used in ROLA message construction | App address, dApp ID |
| **Network ID** | Integer identifying the Radix network: `1` = mainnet, `2` = Stokenet (testnet) | Chain ID |
| **NonFungibleGlobalId** | A string `"<resource_address>:<local_id>"` uniquely identifying a specific NFT on-chain | NFGID, global ID |

## Relationships

- A **Team** has many **Team Members** (confirmed or pending)
- A **Team** is identified on-chain by exactly one **Badge Resource**
- A **Badge Resource** mints one **Badge NFT** per **Team Member**
- Each **Badge NFT** contains a **Virtual Badge** (`mfa_virtual_resource`) linking the NFT to the member's signing key
- A **Team** owns many **Vaults**
- A **Vault** has its own **Access Rule** and **Threshold** (independent of the Badge Resource's threshold)
- A **Vault** has many **Vault Proposals**
- A **Team** has many **Team Proposals** (add/remove member, change threshold)
- A **Proposal** collects many **Proposal Signatures** (one per eligible signer)
- A **Proposal** becomes **Ready** when **Signature Progress** reaches the **Threshold**
- A **Ready Proposal** is assembled into a **Transaction Intent** (root manifest + child **Subintent** + signatures)
- The **Fee Payer** pays fees for vault/team creation and proposal submission
- A **Session** is created after **ROLA** verification (**Challenge** → **Signed Challenge** → verify)

## Flagged ambiguities

- **"vault"** is used for both the domain **Vault** entity (a multisig account) and Radix internal vaults (storage containers within accounts for holding resources). The latter appears in Gateway responses as `vault_address` and in `RECALL_NON_FUNGIBLES_FROM_VAULT`. These are completely distinct concepts — recommend always using "internal vault" or "badge vault" for the Radix storage concept.

- **"signer"** has four distinct meanings: (1) a CLI bootstrap config entry (`PublicKeySignerSchema` | `VirtualBadgeSignerSchema`), (2) an API response object (`SignerSchema`), (3) a parsed access rule entry (`ParsedSigner`), and (4) the fee payer's key service (`Signer` from `@radix-effects/tx-tool`). Recommend qualifying each usage: "configured signer", "active signer", "parsed signer", "transaction signer".

- **"badge"** is used for the Badge Resource (the on-chain `NonFungibleResourceManager`), individual Badge NFTs (one per member), internal badge vaults (where NFTs are stored), and Virtual Badges (system-issued key representations). Recommend always specifying: "Badge Resource", "Badge NFT", "badge vault" (internal), or "Virtual Badge".

- **"threshold"** applies independently to the Badge Resource (team-level operations) and to each Vault (vault-level operations). A team can have different thresholds per entity. Recommend specifying "badge threshold" vs. "vault threshold" when context is ambiguous.

- **"entity address"** on a Proposal means different things by proposal type: it's the vault address for vault proposals and change-threshold proposals, but the badge resource address for add/remove-member proposals. The `EntityAddress` branded type covers all cases.

- **"manifest"** refers to both the user-authored text stored in a Proposal and the system-generated scripts from `buildXxxManifest` functions, as well as the root manifest in the Transaction Intent (which wraps a Subintent). Recommend: "proposal manifest" (stored text), "root manifest" (the wrapper), and "subintent manifest" (the child, ending in `YIELD_TO_PARENT`).

## Example dialogue

> **Dev:** "When a **Team Member** creates a **Vault Proposal**, what exactly gets stored?"
> **Domain expert:** "The server builds a **Subintent** from the user's **Manifest**, which produces a **Partial Transaction** (hex), a **Subintent Hash**, and an **Intent Discriminator**. All of these are stored on the **Proposal** record along with the **Epoch** bounds and **Max Proposer Timestamp**. The status starts as **Created**."

> **Dev:** "And then signers... sign the **Subintent**?"
> **Domain expert:** "Right. The wallet receives the **Partial Transaction** and returns a **Signed Partial Transaction**. The server extracts the signature bytes and **Public Key Hash**, verifies the signer is in the entity's **Access Rule**, and stores a **Proposal Signature**. First signature moves the status to **Signing**; when **Signature Progress** reaches the **Threshold**, it becomes **Ready**."

> **Dev:** "What's the difference between the **Badge Resource** threshold and a **Vault** threshold?"
> **Domain expert:** "Each entity has its own **Access Rule** with its own **Threshold**. The **Badge Resource** threshold governs team management — adding or removing members. Each **Vault** has an independent threshold for its own transactions. A **Change-Threshold Proposal** only updates one **Vault's** threshold, not the badge's."

> **Dev:** "When we say a member 'holds a badge', do we mean the **Badge NFT** or the **Virtual Badge**?"
> **Domain expert:** "The **Badge NFT** — that's the actual token in their account. The **Virtual Badge** is a system concept representing their signing key. The **Badge NFT** has a field `mfa_virtual_resource` that points to the member's **Virtual Badge**. You need the **Badge NFT** to be a confirmed member, but the **Access Rule** references **Virtual Badges**, not Badge NFTs directly."
