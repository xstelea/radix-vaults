import { randomBytes } from 'node:crypto'
import { blake2b } from '@noble/hashes/blake2.js'
import { RadixEngineToolkit } from '@radixdlt/radix-engine-toolkit'
import type { ParsedSigner } from './accessRuleValidator'

export type { ParsedSigner }

type NetworkAddresses = {
  ed25519BadgeResource: string
  secp256k1BadgeResource: string
  accountPackage: string
  resourcePackage: string
}

export const getNetworkAddresses = async (
  networkId: number
): Promise<NetworkAddresses> => {
  const known = await RadixEngineToolkit.Utils.knownAddresses(networkId)
  return {
    ed25519BadgeResource: known.resourceAddresses.ed25519SignatureVirtualBadge,
    secp256k1BadgeResource:
      known.resourceAddresses.secp256k1SignatureVirtualBadge,
    accountPackage: known.packageAddresses.accountPackage,
    resourcePackage: known.packageAddresses.resourcePackage
  }
}

const ED25519_RESOURCE_SUFFIX = 'ed25sg'

const isEd25519Resource = (resourceAddress: string): boolean =>
  resourceAddress.includes(ED25519_RESOURCE_SUFFIX)

export function buildSignerEntries(
  signers: ReadonlyArray<ParsedSigner>,
  addrs: NetworkAddresses
): string {
  return signers
    .map((s) => {
      const resource = isEd25519Resource(s.resourceAddress)
        ? addrs.ed25519BadgeResource
        : addrs.secp256k1BadgeResource
      return [
        '                        Enum<0u8>(',
        `                            NonFungibleGlobalId("${resource}:${s.localId}")`,
        '                        )'
      ].join('\n')
    })
    .join(',\n')
}

export function buildMultisigAccessRule(
  signers: ReadonlyArray<ParsedSigner>,
  threshold: number,
  addrs: NetworkAddresses
): string {
  const entries = buildSignerEntries(signers, addrs)
  if (threshold === signers.length) {
    return `Enum<2u8>(
            Enum<0u8>(
                Enum<3u8>(
                    Array<Enum>(
${entries}
                    )
                )
            )
        )`
  }
  return `Enum<2u8>(
            Enum<0u8>(
                Enum<2u8>(
                    ${threshold}u8,
                    Array<Enum>(
${entries}
                    )
                )
            )
        )`
}

export async function buildCreateVaultManifest(input: {
  feePayerAddress: string
  signers: ReadonlyArray<ParsedSigner>
  threshold: number
  networkId: number
}): Promise<string> {
  const addrs = await getNetworkAddresses(input.networkId)
  const accessRule = buildMultisigAccessRule(
    input.signers,
    input.threshold,
    addrs
  )

  return `CALL_METHOD
    Address("${input.feePayerAddress}")
    "lock_fee"
    Decimal("20")
;
CALL_FUNCTION
    Address("${addrs.accountPackage}")
    "Account"
    "create_advanced"
    Enum<2u8>(
        ${accessRule}
    )
    Enum<0u8>()
;`
}

// --- Team management manifests (subintent, no lock_fee) ---

type SetOwnerRoleEntry = {
  entityAddress: string
  signers: ReadonlyArray<ParsedSigner>
  threshold: number
}

function buildSetOwnerRoleInstructions(
  entries: ReadonlyArray<SetOwnerRoleEntry>,
  addrs: NetworkAddresses
): string {
  return entries
    .map((entry) => {
      const rule = buildMultisigAccessRule(
        entry.signers,
        entry.threshold,
        addrs
      )
      return `SET_OWNER_ROLE
    Address("${entry.entityAddress}")
    ${rule}
;`
    })
    .join('\n')
}

export async function buildAddMemberManifest(input: {
  badgeResource: string
  recipientAccount: string
  name: string
  teamId: string
  virtualBadge: string
  badgeRoleEntry: SetOwnerRoleEntry
  vaultRoleEntries: ReadonlyArray<SetOwnerRoleEntry>
  networkId: number
}): Promise<string> {
  const addrs = await getNetworkAddresses(input.networkId)
  const allRoleEntries = [input.badgeRoleEntry, ...input.vaultRoleEntries]
  const setOwnerInstructions = buildSetOwnerRoleInstructions(
    allRoleEntries,
    addrs
  )

  const localId = `[${randomBytes(32).toString('hex')}]`

  return `MINT_NON_FUNGIBLE
    Address("${input.badgeResource}")
    Map<NonFungibleLocalId, Tuple>(
        NonFungibleLocalId("${localId}") => Tuple(Tuple("${input.name}", "${input.teamId}", "${input.virtualBadge}"))
    )
;
TAKE_ALL_FROM_WORKTOP
    Address("${input.badgeResource}")
    Bucket("badge")
;
CALL_METHOD
    Address("${input.recipientAccount}")
    "try_deposit_or_abort"
    Bucket("badge")
    Enum<0u8>()
;
${setOwnerInstructions}`
}

export async function buildRemoveMemberManifest(input: {
  badgeResource: string
  memberInternalVaultAddress: string
  nftLocalId: string
  badgeRoleEntry: SetOwnerRoleEntry
  vaultRoleEntries: ReadonlyArray<SetOwnerRoleEntry>
  networkId: number
}): Promise<string> {
  const addrs = await getNetworkAddresses(input.networkId)
  const allRoleEntries = [input.badgeRoleEntry, ...input.vaultRoleEntries]
  const setOwnerInstructions = buildSetOwnerRoleInstructions(
    allRoleEntries,
    addrs
  )

  return `RECALL_NON_FUNGIBLES_FROM_VAULT
    Address("${input.memberInternalVaultAddress}")
    Array<NonFungibleLocalId>(NonFungibleLocalId("${input.nftLocalId}"))
;
TAKE_ALL_FROM_WORKTOP
    Address("${input.badgeResource}")
    Bucket("recalled")
;
BURN_RESOURCE
    Bucket("recalled")
;
${setOwnerInstructions}`
}

export async function buildChangeThresholdManifest(input: {
  vaultAddress: string
  signers: ReadonlyArray<ParsedSigner>
  threshold: number
  networkId: number
}): Promise<string> {
  const addrs = await getNetworkAddresses(input.networkId)
  const rule = buildMultisigAccessRule(input.signers, input.threshold, addrs)

  return `SET_OWNER_ROLE
    Address("${input.vaultAddress}")
    ${rule}
;`
}

// --- Team badge creation manifest ---

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16) as number
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function deriveSignatureBadgeLocalId(publicKeyHex: string): string {
  const bytes = hexToBytes(publicKeyHex)
  const hash = blake2b(bytes, { dkLen: 32 })
  return bytesToHex(hash.slice(-26))
}

function resolveVirtualBadge(
  virtualBadge: string,
  addrs: NetworkAddresses
): { resource: string; localId: string } {
  const colonIdx = virtualBadge.lastIndexOf(':')
  const resource = virtualBadge.slice(0, colonIdx)
  const rawLocalId = virtualBadge.slice(colonIdx + 1)
  // Strip surrounding brackets if present: [abc] -> abc
  const localId = rawLocalId.startsWith('[')
    ? rawLocalId.slice(1, -1)
    : rawLocalId
  return { resource, localId }
}

export async function buildCreateTeamBadgeManifest(input: {
  feePayerAddress: string
  creatorVirtualBadge: string
  creatorAccount: string
  memberName: string
  teamId: string
  networkId: number
}): Promise<string> {
  const addrs = await getNetworkAddresses(input.networkId)
  const { resource, localId } = resolveVirtualBadge(
    input.creatorVirtualBadge,
    addrs
  )
  const nfgid = `${resource}:[${localId}]`

  // 1-of-1 access rule (single creator)
  const accessRule = `Enum<2u8>(
            Enum<0u8>(
                Enum<0u8>(
                    Enum<0u8>(
                        NonFungibleGlobalId("${nfgid}")
                    )
                )
            )
        )`

  // 3-field NFT schema: (name: String, teamId: String, mfa_virtual_resource: String)
  const nftSchema = `Enum<0u8>(
        Enum<0u8>(
            Tuple(
                Array<Enum>(
                    Enum<14u8>(
                        Array<Enum>(
                            Enum<0u8>(12u8),
                            Enum<0u8>(12u8),
                            Enum<0u8>(12u8)
                        )
                    )
                ),
                Array<Tuple>(
                    Tuple(
                        Enum<0u8>(),
                        Enum<1u8>(
                            Enum<0u8>(
                                Array<String>("name", "teamId", "mfa_virtual_resource")
                            )
                        )
                    )
                ),
                Array<Enum>(
                    Enum<0u8>()
                )
            )
        ),
        Enum<1u8>(0u64),
        Array<String>()
    )`

  const nftLocalId = `[${randomBytes(32).toString('hex')}]`

  return `CALL_METHOD
    Address("${input.feePayerAddress}")
    "lock_fee"
    Decimal("30")
;
ALLOCATE_GLOBAL_ADDRESS
    Address("${addrs.resourcePackage}")
    "NonFungibleResourceManager"
    AddressReservation("badge_reservation")
    NamedAddress("badge_address")
;
CREATE_NON_FUNGIBLE_RESOURCE_WITH_INITIAL_SUPPLY
    Enum<2u8>(
        Enum<0u8>()
    )
    Enum<2u8>()
    true
    ${nftSchema}
    Map<NonFungibleLocalId, Tuple>(
        NonFungibleLocalId("${nftLocalId}") => Tuple(Tuple("${input.memberName}", "${input.teamId}", "${nfgid}"))
    )
    Tuple(
        Enum<1u8>(Tuple(Enum<0u8>(), Enum<0u8>())),
        Enum<1u8>(Tuple(Enum<0u8>(), Enum<0u8>())),
        Enum<0u8>(),
        Enum<1u8>(Tuple(Enum<0u8>(), Enum<0u8>())),
        Enum<0u8>(),
        Enum<0u8>(),
        Enum<0u8>()
    )
    Tuple(
        Map<String, Tuple>(
            "name" => Tuple(Enum<1u8>(Enum<0u8>("${input.memberName} Team Badge")), true)
        ),
        Map<String, Enum>()
    )
    Enum<1u8>(AddressReservation("badge_reservation"))
;
CALL_METHOD
    Address("${input.feePayerAddress}")
    "try_deposit_batch_or_abort"
    Expression("ENTIRE_WORKTOP")
    Enum<0u8>()
;
CALL_METHOD
    Address("${input.feePayerAddress}")
    "withdraw_non_fungibles"
    NamedAddress("badge_address")
    Array<NonFungibleLocalId>(NonFungibleLocalId("${nftLocalId}"))
;
CALL_METHOD
    Address("${input.creatorAccount}")
    "try_deposit_batch_or_abort"
    Expression("ENTIRE_WORKTOP")
    Enum<0u8>()
;
CALL_ROLE_ASSIGNMENT_METHOD
    NamedAddress("badge_address")
    "set_owner"
    ${accessRule}
;`
}
