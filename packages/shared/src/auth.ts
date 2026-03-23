import { AccountAddress, HexString } from '@radix-effects/shared'
import { HttpApiSchema } from '@effect/platform'
import * as Schema from 'effect/Schema'

export const SignedChallengeProofSchema = Schema.Struct({
  publicKey: HexString,
  signature: HexString,
  curve: Schema.Literal('curve25519', 'secp256k1')
})

export const SignedChallengeSchema = Schema.Struct({
  address: AccountAddress,
  type: Schema.Literal('persona', 'account'),
  challenge: HexString,
  proof: SignedChallengeProofSchema
})

export const CreateChallengeResponseSchema = Schema.Struct({
  challenge: HexString
})

export const VerifyRequestSchema = Schema.Struct({
  signedChallenge: SignedChallengeSchema
})

export const SessionInfoSchema = Schema.Struct({
  accountAddress: AccountAddress,
  expiresAt: Schema.String
})

export class InvalidOrExpiredChallengeError extends Schema.TaggedError<InvalidOrExpiredChallengeError>()(
  'InvalidOrExpiredChallengeError',
  {
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 401 })
) {}

export class RolaVerificationFailedError extends Schema.TaggedError<RolaVerificationFailedError>()(
  'RolaVerificationFailedError',
  {
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 401 })
) {}

export type SignedChallenge = typeof SignedChallengeSchema.Type
export type SignedChallengeProof = typeof SignedChallengeProofSchema.Type
export type SessionInfo = typeof SessionInfoSchema.Type
