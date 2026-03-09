import { describe, expect, it } from 'vitest'
import { computeMismatch } from './team'

const ED25519_RESOURCE =
  'resource_rdx1nfxxxxxxxxxxed25sgxxxxxxxxx002236757237xxxxxxxxxed25sg'
const SECP256K1_RESOURCE =
  'resource_rdx1nfxxxxxxxxxxsecpsgxxxxxxxxx004638826440xxxxxxxxxecdsa'

describe('computeMismatch', () => {
  it('returns false when counts and key types match', () => {
    const onChain = [
      { resourceAddress: ED25519_RESOURCE, localId: '{hash1}' },
      { resourceAddress: ED25519_RESOURCE, localId: '{hash2}' }
    ]
    const registered = [{ keyType: 'ed25519' }, { keyType: 'ed25519' }]

    expect(computeMismatch(onChain, registered)).toBe(false)
  })

  it('returns true when total counts differ', () => {
    const onChain = [
      { resourceAddress: ED25519_RESOURCE, localId: '{hash1}' },
      { resourceAddress: ED25519_RESOURCE, localId: '{hash2}' },
      { resourceAddress: ED25519_RESOURCE, localId: '{hash3}' }
    ]
    const registered = [{ keyType: 'ed25519' }, { keyType: 'ed25519' }]

    expect(computeMismatch(onChain, registered)).toBe(true)
  })

  it('returns true when key type counts differ', () => {
    const onChain = [
      { resourceAddress: ED25519_RESOURCE, localId: '{hash1}' },
      { resourceAddress: SECP256K1_RESOURCE, localId: '{hash2}' }
    ]
    const registered = [{ keyType: 'ed25519' }, { keyType: 'ed25519' }]

    expect(computeMismatch(onChain, registered)).toBe(true)
  })

  it('returns false with mixed key types that match', () => {
    const onChain = [
      { resourceAddress: ED25519_RESOURCE, localId: '{hash1}' },
      { resourceAddress: SECP256K1_RESOURCE, localId: '{hash2}' }
    ]
    const registered = [{ keyType: 'ed25519' }, { keyType: 'secp256k1' }]

    expect(computeMismatch(onChain, registered)).toBe(false)
  })

  it('returns false when both sets are empty', () => {
    expect(computeMismatch([], [])).toBe(false)
  })

  it('returns true when no sources registered but signers exist', () => {
    const onChain = [{ resourceAddress: ED25519_RESOURCE, localId: '{hash1}' }]
    expect(computeMismatch(onChain, [])).toBe(true)
  })
})
