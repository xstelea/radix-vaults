import { RadixEngineToolkit } from '@radixdlt/radix-engine-toolkit'
import { blake2b } from '@noble/hashes/blake2.js'
import type { Signer } from './config'

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

export async function buildCreateTeamAccountManifest(input: {
  feePayerAddress: string
  signers: ReadonlyArray<Signer>
  threshold: number
  networkId: NetworkId
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

export async function buildCreateBadgeResourceManifest(input: {
  feePayerAddress: string
  signers: ReadonlyArray<Signer>
  threshold: number
  networkId: NetworkId
  recipients: ReadonlyArray<string>
  badgeName: string
}): Promise<string> {
  const addrs = await getNetworkAddresses(input.networkId)
  const accessRule = buildMultisigAccessRule(
    input.signers,
    input.threshold,
    addrs
  )

  // NamedAddress works in CALL_METHOD args but not in TAKE_FROM_WORKTOP
  // (which requires ResourceAddress). So: deposit all to fee payer first,
  // then withdraw+deposit 1 at a time per recipient.
  const distribute = input.recipients
    .map(
      (recipient) =>
        `CALL_METHOD
    Address("${input.feePayerAddress}")
    "withdraw"
    NamedAddress("badge_address")
    Decimal("1")
;
CALL_METHOD
    Address("${recipient}")
    "try_deposit_batch_or_abort"
    Expression("ENTIRE_WORKTOP")
    Enum<0u8>()
;`
    )
    .join('\n')

  return `CALL_METHOD
    Address("${input.feePayerAddress}")
    "lock_fee"
    Decimal("30")
;
ALLOCATE_GLOBAL_ADDRESS
    Address("${addrs.resourcePackage}")
    "FungibleResourceManager"
    AddressReservation("badge_reservation")
    NamedAddress("badge_address")
;
CREATE_FUNGIBLE_RESOURCE_WITH_INITIAL_SUPPLY
    Enum<2u8>(
        ${accessRule}
    )
    true
    0u8
    Decimal("${input.recipients.length}")
    Tuple(
        Enum<0u8>(),
        Enum<0u8>(),
        Enum<1u8>(Tuple(Enum<0u8>(), Enum<0u8>())),
        Enum<1u8>(Tuple(Enum<0u8>(), Enum<0u8>())),
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
${distribute}`
}
