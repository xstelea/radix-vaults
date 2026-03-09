import { blake2b } from '@noble/hashes/blake2.js'

const NETWORK_ADDRESSES = {
  1: {
    ed25519BadgeResource:
      'resource_rdx1nfxxxxxxxxxxed25sgxxxxxxxxx002236757237xxxxxxxxxed25sg',
    secp256k1BadgeResource:
      'resource_rdx1nfxxxxxxxxxxsecpsgxxxxxxxxx004638826440xxxxxxxxxsecpsg',
    accountPackage:
      'package_rdx1pkgxxxxxxxxxaccntxxxxxxxxxx000929625493xxxxxxxxxaccntt',
    resourcePackage:
      'package_rdx1pkgxxxxxxxxxresaborxxxxxxxx000538856144xxxxxxxxxnvmhds'
  },
  2: {
    ed25519BadgeResource:
      'resource_tdx_2_1nfxxxxxxxxxxed25sgxxxxxxxxx002236757237xxxxxxxxx3e2cpa',
    secp256k1BadgeResource:
      'resource_tdx_2_1nfxxxxxxxxxxsecpsgxxxxxxxxx004638826440xxxxxxxxx5r08kq',
    accountPackage:
      'package_tdx_2_1pkgxxxxxxxxxaccntxxxxxxxxxx000929625493xxxxxxxxxtpu8hm',
    resourcePackage:
      'package_tdx_2_1pkgxxxxxxxxxresrcxxxxxxxxxxxxxxx000538436477xxxxxxxxxnvmhds'
  }
} as const

export type NetworkId = keyof typeof NETWORK_ADDRESSES

export const getNetworkAddresses = (networkId: NetworkId) =>
  NETWORK_ADDRESSES[networkId]

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
  networkId: NetworkId,
  keyType: 'ed25519' | 'secp256k1'
): string {
  const addrs = getNetworkAddresses(networkId)
  return keyType === 'ed25519'
    ? addrs.ed25519BadgeResource
    : addrs.secp256k1BadgeResource
}

function buildSignerEntries(
  signers: ReadonlyArray<{
    publicKey: string
    keyType: 'ed25519' | 'secp256k1'
  }>,
  networkId: NetworkId
): string {
  return signers
    .map((s) => {
      const resource = badgeResourceForKeyType(networkId, s.keyType)
      const localId = deriveSignatureBadgeLocalId(s.publicKey)
      return [
        '                    Enum<0u8>(',
        '                        Enum<0u8>(',
        `                            NonFungibleGlobalId("${resource}:[${localId}]")`,
        '                        )',
        '                    )'
      ].join('\n')
    })
    .join(',\n')
}

function buildMultisigAccessRule(
  signers: ReadonlyArray<{
    publicKey: string
    keyType: 'ed25519' | 'secp256k1'
  }>,
  threshold: number,
  networkId: NetworkId
): string {
  const entries = buildSignerEntries(signers, networkId)
  if (threshold === signers.length) {
    // AllOf
    return `Enum<2u8>(
            Enum<2u8>(
                Array<Enum>(
${entries}
                )
            )
        )`
  }
  // CountOf (n-of-m)
  return `Enum<2u8>(
            Enum<1u8>(
                ${threshold}u8,
                Array<Enum>(
${entries}
                )
            )
        )`
}

export function buildCreateTeamAccountManifest(input: {
  feePayerAddress: string
  signers: ReadonlyArray<{
    publicKey: string
    keyType: 'ed25519' | 'secp256k1'
  }>
  threshold: number
  networkId: NetworkId
}): string {
  const { accountPackage } = getNetworkAddresses(input.networkId)
  const accessRule = buildMultisigAccessRule(
    input.signers,
    input.threshold,
    input.networkId
  )

  return `CALL_METHOD
    Address("${input.feePayerAddress}")
    "lock_fee"
    Decimal("20")
;
CALL_FUNCTION
    Address("${accountPackage}")
    "Account"
    "create_advanced"
    Enum<2u8>(
        ${accessRule}
    )
    Enum<0u8>()
;`
}

export function buildCreateBadgeResourceManifest(input: {
  feePayerAddress: string
  signers: ReadonlyArray<{
    publicKey: string
    keyType: 'ed25519' | 'secp256k1'
  }>
  threshold: number
  networkId: NetworkId
  recipientCount: number
  badgeName: string
}): string {
  const accessRule = buildMultisigAccessRule(
    input.signers,
    input.threshold,
    input.networkId
  )

  return `CALL_METHOD
    Address("${input.feePayerAddress}")
    "lock_fee"
    Decimal("30")
;
CREATE_FUNGIBLE_RESOURCE_WITH_INITIAL_SUPPLY
    Enum<2u8>(
        ${accessRule}
    )
    true
    0u8
    Decimal("${input.recipientCount}")
    Tuple(
        Enum<0u8>()
        Enum<0u8>()
        Enum<1u8>(Tuple(Enum<0u8>(), Enum<1u8>()))
        Enum<1u8>(Tuple(Enum<0u8>(), Enum<1u8>()))
        Enum<0u8>()
        Enum<0u8>()
    )
    Tuple(
        Map<String, Tuple>(
            "name" => Tuple(Enum<1u8>(Enum<0u8>("${input.badgeName}")), true)
        )
        Map<String, Enum>()
    )
    Enum<0u8>()
;
CALL_METHOD
    Address("${input.feePayerAddress}")
    "try_deposit_batch_or_abort"
    Expression("ENTIRE_WORKTOP")
    Enum<0u8>()
;`
}

export function buildDistributeBadgesManifest(input: {
  feePayerAddress: string
  badgeResourceAddress: string
  recipients: ReadonlyArray<string>
}): string {
  const totalAmount = input.recipients.length
  const withdrawAndDeposit = input.recipients
    .map(
      (recipient, i) =>
        `TAKE_FROM_WORKTOP
    Address("${input.badgeResourceAddress}")
    Decimal("1")
    Bucket("badge_${i}")
;
CALL_METHOD
    Address("${recipient}")
    "try_deposit_or_abort"
    Bucket("badge_${i}")
    Enum<0u8>()
;`
    )
    .join('\n')

  return `CALL_METHOD
    Address("${input.feePayerAddress}")
    "lock_fee"
    Decimal("30")
;
CALL_METHOD
    Address("${input.feePayerAddress}")
    "withdraw"
    Address("${input.badgeResourceAddress}")
    Decimal("${totalAmount}")
;
${withdrawAndDeposit}`
}
