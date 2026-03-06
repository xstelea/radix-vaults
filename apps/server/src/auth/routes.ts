import {
  HttpLayerRouter,
  HttpServerRequest,
  HttpServerResponse
} from '@effect/platform'
import type { SignedChallenge } from '@radix-vaults/shared'
import { Effect, Layer } from 'effect'
import { BadgeChecker } from './badgeChecker'
import { SESSION_COOKIE_NAME, requireAuth } from './authSession'
import { ChallengeStore } from './challengeStore'
import { RolaVerifier } from './rola'
import { SessionStore } from './sessionStore'

const jsonResponse = (body: unknown, status = 200) =>
  HttpServerResponse.json(body).pipe(
    Effect.map((res) => res.pipe(HttpServerResponse.setStatus(status)))
  )

const jsonResponseWithCookie = (body: unknown, cookie: string, status = 200) =>
  HttpServerResponse.json(body).pipe(
    Effect.map((res) =>
      res.pipe(
        HttpServerResponse.setStatus(status),
        HttpServerResponse.setHeader('Set-Cookie', cookie)
      )
    )
  )

const errorResponse = (error: string, status = 400) =>
  jsonResponse({ error }, status)

const CreateChallengeRoute = HttpLayerRouter.add(
  'GET',
  '/auth/challenge',
  Effect.gen(function* () {
    const store = yield* ChallengeStore
    const challenge = yield* store.create()
    return yield* jsonResponse({ challenge })
  })
)

const VerifyRoute = HttpLayerRouter.add(
  'POST',
  '/auth/verify',
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = yield* request.json as Effect.Effect<{
      signedChallenges: SignedChallenge[]
    }>

    const signedChallenges = body.signedChallenges
    if (!Array.isArray(signedChallenges) || signedChallenges.length === 0) {
      return yield* errorResponse('signedChallenges array is required')
    }

    const challengeStore = yield* ChallengeStore
    const rolaVerifier = yield* RolaVerifier
    const badgeChecker = yield* BadgeChecker
    const sessionStore = yield* SessionStore

    const challenges = [...new Set(signedChallenges.map((sc) => sc.challenge))]
    for (const challenge of challenges) {
      yield* challengeStore.consume(challenge).pipe(
        Effect.mapError(() => ({
          _tag: 'AuthError' as const,
          message: 'Invalid or expired challenge'
        }))
      )
    }

    for (const sc of signedChallenges) {
      yield* rolaVerifier.verify(sc).pipe(
        Effect.mapError((e) => ({
          _tag: 'AuthError' as const,
          message: `ROLA verification failed: ${e.reason}`
        }))
      )
    }

    const accountChallenge = signedChallenges.find(
      (sc) => sc.type === 'account'
    )
    if (!accountChallenge) {
      return yield* errorResponse('No account proof provided')
    }

    yield* badgeChecker.hasBadge(accountChallenge.address).pipe(
      Effect.mapError((e) => ({
        _tag: 'AuthError' as const,
        message:
          e._tag === 'NoBadgeError'
            ? 'Account does not hold team member badge'
            : e.reason
      }))
    )

    const session = yield* sessionStore.create(accountChallenge.address)
    const cookie = [
      `${SESSION_COOKIE_NAME}=${session.id}`,
      'HttpOnly',
      'SameSite=Strict',
      'Path=/',
      `Max-Age=${24 * 60 * 60}`
    ].join('; ')

    return yield* jsonResponseWithCookie(
      {
        accountAddress: accountChallenge.address,
        expiresAt: session.expiresAt.toISOString()
      },
      cookie
    )
  }).pipe(Effect.catchTag('AuthError', (e) => errorResponse(e.message, 401)))
)

const GetSessionRoute = HttpLayerRouter.add(
  'GET',
  '/auth/session',
  Effect.gen(function* () {
    const session = yield* requireAuth
    return yield* jsonResponse({
      accountAddress: session.accountAddress
    })
  }).pipe(
    Effect.catchTag('UnauthorizedError', () =>
      jsonResponse({ authenticated: false }, 401)
    )
  )
)

const LogoutRoute = HttpLayerRouter.add(
  'POST',
  '/auth/logout',
  Effect.gen(function* () {
    const session = yield* requireAuth.pipe(
      Effect.catchTag('UnauthorizedError', () => Effect.succeed(null))
    )

    if (session) {
      const sessionStore = yield* SessionStore
      yield* sessionStore.destroy(session.sessionId)
    }

    const clearCookie = [
      `${SESSION_COOKIE_NAME}=`,
      'HttpOnly',
      'SameSite=Strict',
      'Path=/',
      'Max-Age=0'
    ].join('; ')

    return yield* jsonResponseWithCookie({ ok: true }, clearCookie)
  })
)

export const AuthRoutesLive = Layer.mergeAll(
  CreateChallengeRoute,
  VerifyRoute,
  GetSessionRoute,
  LogoutRoute
)
