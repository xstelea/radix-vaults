export type ParsedSigner = {
  resourceAddress: string
  localId: string
}

export type ParsedAccessRule =
  | { type: 'CountOf'; count: number; signers: ParsedSigner[] }
  | { type: 'AllOf'; signers: ParsedSigner[] }

const parseNonFungible = (item: unknown): ParsedSigner | null => {
  if (
    typeof item !== 'object' ||
    item === null ||
    !('type' in item) ||
    (item as { type: string }).type !== 'NonFungible'
  )
    return null

  const nf = (item as { non_fungible?: unknown }).non_fungible
  if (typeof nf !== 'object' || nf === null) return null

  const { resource_address, local_id } = nf as {
    resource_address?: string
    local_id?: unknown
  }
  if (typeof resource_address !== 'string' || !local_id) return null

  const localId =
    typeof local_id === 'string'
      ? local_id
      : typeof local_id === 'object' &&
          local_id !== null &&
          'simple_rep' in local_id &&
          typeof (local_id as { simple_rep: unknown }).simple_rep === 'string'
        ? (local_id as { simple_rep: string }).simple_rep
        : null
  if (!localId) return null

  return { resourceAddress: resource_address, localId }
}

const parseSignerList = (list: unknown): ParsedSigner[] | null => {
  if (!Array.isArray(list)) return null
  const signers: ParsedSigner[] = []
  for (const item of list) {
    const signer = parseNonFungible(item)
    if (!signer) return null
    signers.push(signer)
  }
  return signers.length > 0 ? signers : null
}

/**
 * Parses the Gateway API's JSON representation of an OwnerRole into a supported
 * access rule (CountOf or AllOf of NonFungible signature badges).
 *
 * Expected JSON shape:
 * {
 *   "rule": {
 *     "type": "Protected",
 *     "access_rule": {
 *       "type": "ProofRule",
 *       "proof_rule": { "type": "CountOf"|"AllOf", ... }
 *     }
 *   },
 *   "updater": "None"|"Owner"|"Object"
 * }
 */
export const parseOwnerAccessRule = (
  ownerJson: unknown
): ParsedAccessRule | null => {
  if (typeof ownerJson !== 'object' || ownerJson === null) return null

  const { rule } = ownerJson as { rule?: unknown }
  if (typeof rule !== 'object' || rule === null) return null

  const ruleObj = rule as { type?: string; access_rule?: unknown }
  if (ruleObj.type !== 'Protected') return null

  const accessRule = ruleObj.access_rule as {
    type?: string
    proof_rule?: unknown
  }
  if (typeof accessRule !== 'object' || accessRule === null) return null
  if (accessRule.type !== 'ProofRule') return null

  const proofRule = accessRule.proof_rule as {
    type?: string
    count?: number
    list?: unknown
  }
  if (typeof proofRule !== 'object' || proofRule === null) return null

  if (proofRule.type === 'CountOf') {
    if (typeof proofRule.count !== 'number') return null
    const signers = parseSignerList(proofRule.list)
    if (!signers) return null
    return { type: 'CountOf', count: proofRule.count, signers }
  }

  if (proofRule.type === 'AllOf') {
    const signers = parseSignerList(proofRule.list)
    if (!signers) return null
    return { type: 'AllOf', signers }
  }

  return null
}
