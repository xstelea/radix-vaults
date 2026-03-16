import { RadixEngineToolkit } from '@radixdlt/radix-engine-toolkit'
import { blake2b } from '@noble/hashes/blake2.js'
import type { Member, Signer } from './config'

export type NetworkId = number

type NetworkAddresses = {
  ed25519BadgeResource: string
  secp256k1BadgeResource: string
  accountPackage: string
  resourcePackage: string
}

export const getNetworkAddresses = async (
  networkId: NetworkId
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

export function deriveSignatureBadgeLocalId(publicKeyHex: string): string {
  const bytes = hexToBytes(publicKeyHex)
  const hash = blake2b(bytes, { dkLen: 32 })
  return bytesToHex(hash.slice(-26))
}

function badgeResourceForKeyType(
  addrs: NetworkAddresses,
  keyType: 'ed25519' | 'secp256k1'
): string {
  return keyType === 'ed25519'
    ? addrs.ed25519BadgeResource
    : addrs.secp256k1BadgeResource
}

export function resolveSignerNFG(
  signer: Signer,
  addrs: NetworkAddresses
): { resource: string; localId: string } {
  if ('virtualBadge' in signer) {
    const colonIdx = signer.virtualBadge.lastIndexOf(':')
    const resource = signer.virtualBadge.slice(0, colonIdx)
    const localId = signer.virtualBadge.slice(colonIdx + 2, -1) // strip [ and ]
    return { resource, localId }
  }
  return {
    resource: badgeResourceForKeyType(addrs, signer.keyType),
    localId: deriveSignatureBadgeLocalId(signer.publicKey)
  }
}

function buildSignerEntries(
  signers: ReadonlyArray<Signer>,
  addrs: NetworkAddresses
): string {
  return signers
    .map((s) => {
      const { resource, localId } = resolveSignerNFG(s, addrs)
      return [
        '                        Enum<0u8>(',
        `                            NonFungibleGlobalId("${resource}:[${localId}]")`,
        '                        )'
      ].join('\n')
    })
    .join(',\n')
}

function buildMultisigAccessRule(
  signers: ReadonlyArray<Signer>,
  threshold: number,
  addrs: NetworkAddresses
): string {
  const entries = buildSignerEntries(signers, addrs)
  if (threshold === signers.length) {
    // Protected(BasicRequirement(AllOf(entries)))
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
  // Protected(BasicRequirement(CountOf(threshold, entries)))
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

/**
 * Resolve a member's virtual badge NonFungibleGlobalId and Bytes local ID.
 */
function resolveMemberBadgeInfo(
  member: Member,
  addrs: NetworkAddresses
): { resource: string; localId: string; nfgid: string } {
  const { resource, localId } = resolveSignerNFG(member.signer, addrs)
  return {
    resource,
    localId,
    nfgid: `${resource}:[${localId}]`
  }
}

export async function buildCreateBadgeResourceManifest(input: {
  feePayerAddress: string
  members: ReadonlyArray<Member>
  threshold: number
  networkId: NetworkId
  badgeName: string
}): Promise<string> {
  const addrs = await getNetworkAddresses(input.networkId)
  const signers = input.members.map((m) => m.signer)
  const accessRule = buildMultisigAccessRule(signers, input.threshold, addrs)

  const resolvedMembers = input.members.map((m) => ({
    ...m,
    badge: resolveMemberBadgeInfo(m, addrs)
  }))

  // Build initial supply entries: Map<NonFungibleLocalId, Tuple>
  const initialSupplyEntries = resolvedMembers
    .map(
      (m) =>
        `        NonFungibleLocalId("[${m.badge.localId}]") => Tuple(Tuple("${m.name}", "${m.badge.nfgid}"))`
    )
    .join(',\n')

  // Distribution strategy: deposit all NFTs to fee payer, then withdraw per member.
  // This avoids TAKE_NON_FUNGIBLES_FROM_WORKTOP which rejects NamedAddress in toolkit v1.0.6.
  // CALL_METHOD accepts NamedAddress as a method argument, so withdraw_non_fungibles works.
  const distribute = resolvedMembers
    .map(
      (m) =>
        `CALL_METHOD
    Address("${input.feePayerAddress}")
    "withdraw_non_fungibles"
    NamedAddress("badge_address")
    Array<NonFungibleLocalId>(NonFungibleLocalId("[${m.badge.localId}]"))
;
CALL_METHOD
    Address("${m.recipientAccount}")
    "try_deposit_batch_or_abort"
    Expression("ENTIRE_WORKTOP")
    Enum<0u8>()
;`
    )
    .join('\n')

  // NonFungibleDataSchema::Local for Tuple { name: String, mfa_virtual_resource: String }
  //
  // Schema breakdown:
  //   NonFungibleDataSchema::Local (variant 0)
  //     VersionedScryptoSchema::V1 (variant 0 — define_single_versioned! uses VERSION_N = N-1)
  //       SchemaV1 = Tuple(type_kinds, type_metadata, type_validations)
  //         type_kinds: [TypeKind::Tuple { field_types: [WellKnown(12), WellKnown(12)] }]
  //         type_metadata: [TypeMetadata { type_name: None, child_names: NamedFields(["name", "mfa_virtual_resource"]) }]
  //         type_validations: [TypeValidation::None]
  //     LocalTypeId::SchemaLocalIndex(0) (variant 1)
  //     mutable_fields: []
  //
  // WellKnown discriminator = 0, SchemaLocalIndex discriminator = 1
  // TypeKind::Tuple discriminator = 14
  // String well-known type ID = 12
  const nftSchema = `Enum<0u8>(
        Enum<0u8>(
            Tuple(
                Array<Enum>(
                    Enum<14u8>(
                        Array<Enum>(
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
                                Array<String>("name", "mfa_virtual_resource")
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
${initialSupplyEntries}
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
            "name" => Tuple(Enum<1u8>(Enum<0u8>("${input.badgeName}")), true)
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
${distribute}
CALL_ROLE_ASSIGNMENT_METHOD
    NamedAddress("badge_address")
    "set_owner"
    ${accessRule}
;`
}
