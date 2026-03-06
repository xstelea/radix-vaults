import { HttpApiBuilder } from '@effect/platform'
import {
  AppApi,
  CurrentSession,
  InvalidOrExpiredChallengeError,
  MissingTeamBadgeError,
  RolaVerificationFailedError,
  sessionCookie
} from '@radix-vaults/shared'
import { Duration, Effect } from 'effect'
import { BadgeChecker } from '../auth/badgeChecker'
import { ChallengeStore } from '../auth/challengeStore'
import { RolaVerifier } from '../auth/rola'
import { SessionStore } from '../auth/sessionStore'

export const AuthHandlersLive = HttpApiBuilder.group(
  AppApi,
  'auth',
  (handlers) =>
    handlers
      .handle('createChallenge', () =>
        Effect.gen(function* () {
          const store = yield* ChallengeStore
          const challenge = yield* store.create()
          return { challenge }
        })
      )
      .handle('verify', ({ payload: { signedChallenge } }) =>
        Effect.gen(function* () {
          const challengeStore = yield* ChallengeStore
          const rolaVerifier = yield* RolaVerifier
          const badgeChecker = yield* BadgeChecker
          const sessionStore = yield* SessionStore

          yield* challengeStore.consume(signedChallenge.challenge).pipe(
            Effect.mapError(
              () =>
                new InvalidOrExpiredChallengeError({
                  message: 'Invalid or expired challenge'
                })
            )
          )

          yield* rolaVerifier.verify(signedChallenge).pipe(
            Effect.mapError(
              (e) =>
                new RolaVerificationFailedError({
                  message: `ROLA verification failed: ${e.reason}`
                })
            )
          )

          yield* badgeChecker.hasBadge(signedChallenge.address).pipe(
            Effect.mapError(
              (e) =>
                new MissingTeamBadgeError({
                  accountAddress: signedChallenge.address,
                  message:
                    e._tag === 'NoBadgeError'
                      ? 'Account does not hold team member badge'
                      : e.reason
                })
            )
          )

          const session = yield* sessionStore.create(signedChallenge.address)

          yield* HttpApiBuilder.securitySetCookie(sessionCookie, session.id, {
            httpOnly: true,
            sameSite: 'strict',
            path: '/',
            maxAge: Duration.decode('24 hours')
          })

          return {
            accountAddress: signedChallenge.address,
            expiresAt: session.expiresAt.toISOString()
          }
        })
      )
      .handle('getSession', () =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          return { accountAddress: session.accountAddress }
        })
      )
      .handle('logout', () =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const sessionStore = yield* SessionStore
          yield* sessionStore.destroy(session.sessionId)
          yield* HttpApiBuilder.securitySetCookie(sessionCookie, '', {
            httpOnly: true,
            sameSite: 'strict',
            path: '/',
            maxAge: Duration.millis(0)
          })
          return { ok: true as const }
        })
      )
)
