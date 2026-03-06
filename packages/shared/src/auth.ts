import * as Schema from 'effect/Schema'

export const SignedChallengeProofSchema = Schema.Struct({
  publicKey: Schema.String,
  signature: Schema.String,
  curve: Schema.Literal('curve25519', 'secp256k1')
})

export const SignedChallengeSchema = Schema.Struct({
  address: Schema.String,
  type: Schema.Literal('persona', 'account'),
  challenge: Schema.String,
  proof: SignedChallengeProofSchema
})

export const CreateChallengeResponseSchema = Schema.Struct({
  challenge: Schema.String
})

export const VerifyRequestSchema = Schema.Struct({
  signedChallenges: Schema.Array(SignedChallengeSchema)
})

export const SessionInfoSchema = Schema.Struct({
  accountAddress: Schema.String,
  expiresAt: Schema.String
})

export const AuthErrorSchema = Schema.Struct({
  error: Schema.String
})

export const UnauthorizedErrorSchema = Schema.TaggedStruct(
  'UnauthorizedError',
  {
    message: Schema.String
  }
)

export type SignedChallenge = typeof SignedChallengeSchema.Type
export type SignedChallengeProof = typeof SignedChallengeProofSchema.Type
export type SessionInfo = typeof SessionInfoSchema.Type
