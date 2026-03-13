import { RadixEngineToolkit } from '@radixdlt/radix-engine-toolkit'
import type { ParsedSigner } from './accessRuleValidator'

export type { ParsedSigner }

type NetworkAddresses = {
  ed25519BadgeResource: string
  secp256k1BadgeResource: string
  accountPackage: string
}

export const getNetworkAddresses = async (
  networkId: number
): Promise<NetworkAddresses> => {
  const known = await RadixEngineToolkit.Utils.knownAddresses(networkId)
  return {
    ed25519BadgeResource: known.resourceAddresses.ed25519SignatureVirtualBadge,
    secp256k1BadgeResource:
      known.resourceAddresses.secp256k1SignatureVirtualBadge,
    accountPackage: known.packageAddresses.accountPackage
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

  return `MINT_FUNGIBLE
    Address("${input.badgeResource}")
    Decimal("1")
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

  return `RECALL_FROM_VAULT
    Address("${input.memberInternalVaultAddress}")
    Decimal("1")
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
