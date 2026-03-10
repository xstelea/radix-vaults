import { RadixEngineToolkit } from '@radixdlt/radix-engine-toolkit'
import type { ParsedSigner } from './accessRuleValidator'

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
  resourceAddress.endsWith(ED25519_RESOURCE_SUFFIX)

function stripAngleBrackets(localId: string): string {
  if (localId.startsWith('<') && localId.endsWith('>')) {
    return localId.slice(1, -1)
  }
  return localId
}

function buildSignerEntries(
  signers: ReadonlyArray<ParsedSigner>,
  addrs: NetworkAddresses
): string {
  return signers
    .map((s) => {
      const resource = isEd25519Resource(s.resourceAddress)
        ? addrs.ed25519BadgeResource
        : addrs.secp256k1BadgeResource
      const localId = stripAngleBrackets(s.localId)
      return [
        '                        Enum<0u8>(',
        `                            NonFungibleGlobalId("${resource}:[${localId}]")`,
        '                        )'
      ].join('\n')
    })
    .join(',\n')
}

function buildMultisigAccessRule(
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
