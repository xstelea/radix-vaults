import { describe, expect, it } from 'vitest'
import { parseOwnerAccessRule } from './accessRuleValidator'

const ED25519_SIG_RESOURCE =
  'resource_rdx1nfxxxxxxxxxxed25sgxxxxxxxxx002236757237xxxxxxxxxed25sg'
const SECP256K1_SIG_RESOURCE =
  'resource_rdx1nfxxxxxxxxxxsecpsgxxxxxxxxx004638826440xxxxxxxxxsecpsg'

const makeNonFungible = (resourceAddress: string, localId: string) => ({
  type: 'NonFungible',
  non_fungible: {
    resource_address: resourceAddress,
    local_id: localId
  }
})

const makeOwnerRole = (rule: object, updater = 'Owner') => ({
  rule,
  updater
})

const makeProtectedCountOf = (count: number, list: object[]) => ({
  type: 'Protected',
  access_rule: {
    type: 'ProofRule',
    proof_rule: {
      type: 'CountOf',
      count,
      list
    }
  }
})

const makeProtectedAllOf = (list: object[]) => ({
  type: 'Protected',
  access_rule: {
    type: 'ProofRule',
    proof_rule: {
      type: 'AllOf',
      list
    }
  }
})

describe('parseOwnerAccessRule', () => {
  it('parses CountOf with ed25519 signers', () => {
    const signer1 = makeNonFungible(ED25519_SIG_RESOURCE, '{hash1}')
    const signer2 = makeNonFungible(ED25519_SIG_RESOURCE, '{hash2}')
    const signer3 = makeNonFungible(ED25519_SIG_RESOURCE, '{hash3}')
    const owner = makeOwnerRole(
      makeProtectedCountOf(2, [signer1, signer2, signer3])
    )

    const result = parseOwnerAccessRule(owner)

    expect(result).toEqual({
      type: 'CountOf',
      count: 2,
      signers: [
        { resourceAddress: ED25519_SIG_RESOURCE, localId: '{hash1}' },
        { resourceAddress: ED25519_SIG_RESOURCE, localId: '{hash2}' },
        { resourceAddress: ED25519_SIG_RESOURCE, localId: '{hash3}' }
      ]
    })
  })

  it('parses AllOf with mixed key types', () => {
    const signer1 = makeNonFungible(ED25519_SIG_RESOURCE, '{hash1}')
    const signer2 = makeNonFungible(SECP256K1_SIG_RESOURCE, '{hash2}')
    const owner = makeOwnerRole(makeProtectedAllOf([signer1, signer2]))

    const result = parseOwnerAccessRule(owner)

    expect(result).toEqual({
      type: 'AllOf',
      signers: [
        { resourceAddress: ED25519_SIG_RESOURCE, localId: '{hash1}' },
        { resourceAddress: SECP256K1_SIG_RESOURCE, localId: '{hash2}' }
      ]
    })
  })

  it('rejects AllowAll rule', () => {
    const owner = makeOwnerRole({ type: 'AllowAll' })
    expect(parseOwnerAccessRule(owner)).toBeNull()
  })

  it('rejects DenyAll rule', () => {
    const owner = makeOwnerRole({ type: 'DenyAll' })
    expect(parseOwnerAccessRule(owner)).toBeNull()
  })

  it('rejects null/undefined input', () => {
    expect(parseOwnerAccessRule(null)).toBeNull()
    expect(parseOwnerAccessRule(undefined)).toBeNull()
  })

  it('rejects empty signer list', () => {
    const owner = makeOwnerRole(makeProtectedCountOf(1, []))
    expect(parseOwnerAccessRule(owner)).toBeNull()
  })

  it('rejects non-NonFungible items in signer list', () => {
    const badItem = { type: 'Resource', resource: 'resource_rdx1...' }
    const owner = makeOwnerRole(makeProtectedCountOf(1, [badItem]))
    expect(parseOwnerAccessRule(owner)).toBeNull()
  })

  it('rejects AnyOf proof rule (unsupported)', () => {
    const signer = makeNonFungible(ED25519_SIG_RESOURCE, '{hash1}')
    const owner = makeOwnerRole({
      type: 'Protected',
      access_rule: {
        type: 'ProofRule',
        proof_rule: {
          type: 'AnyOf',
          list: [signer]
        }
      }
    })
    expect(parseOwnerAccessRule(owner)).toBeNull()
  })

  it('rejects nested CompositeRequirement (AnyOf/AllOf at top level)', () => {
    const signer = makeNonFungible(ED25519_SIG_RESOURCE, '{hash1}')
    const owner = makeOwnerRole({
      type: 'Protected',
      access_rule: {
        type: 'AnyOf',
        list: [
          {
            type: 'ProofRule',
            proof_rule: { type: 'Require', requirement: signer }
          }
        ]
      }
    })
    expect(parseOwnerAccessRule(owner)).toBeNull()
  })
})
