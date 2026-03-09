import { describe, expect, it } from 'vitest'
import { createPublicKeyHash } from './proposals'

// Known Ed25519 public key (32 bytes hex)
const ED25519_PUBLIC_KEY =
  'a6b8bde20a317f0a98e95a0c88b81ec6a1f1f44d79bbdf0a8b6b2b5d3f8c2a1e'

describe('createPublicKeyHash', () => {
  it('returns a 29-byte hex string (58 hex chars)', () => {
    const hash = createPublicKeyHash(ED25519_PUBLIC_KEY)
    expect(hash).toHaveLength(58)
  })

  it('is deterministic for the same input', () => {
    const hash1 = createPublicKeyHash(ED25519_PUBLIC_KEY)
    const hash2 = createPublicKeyHash(ED25519_PUBLIC_KEY)
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different keys', () => {
    const key2 =
      'b7c9cef31b428e1ba9fa6b1d99c92fd7b2e2e55e8acce01b9c7c3c6e4e9d3b2f'
    const hash1 = createPublicKeyHash(ED25519_PUBLIC_KEY)
    const hash2 = createPublicKeyHash(key2)
    expect(hash1).not.toBe(hash2)
  })
})
