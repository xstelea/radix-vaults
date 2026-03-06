import { HttpServerRequest } from '@effect/platform'
import { Context, Data, Effect, Layer } from 'effect'
import { SessionStore } from './sessionStore'

export class UnauthorizedError extends Data.TaggedError('UnauthorizedError')<{
  message: string
}> {}

export interface AuthenticatedSession {
  readonly sessionId: string
  readonly accountAddress: string
}

export class AuthSession extends Context.Tag(
  '@radix-vaults/server/auth/AuthSession'
)<AuthSession, AuthenticatedSession>() {}

const parseCookies = (cookieHeader: string): Record<string, string> => {
  const cookies: Record<string, string> = {}
  for (const pair of cookieHeader.split(';')) {
    const [key, ...rest] = pair.trim().split('=')
    if (key) {
      cookies[key] = rest.join('=')
    }
  }
  return cookies
}

export const SESSION_COOKIE_NAME = 'radix_vault_session'

export const requireAuth = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const cookieHeader = request.headers['cookie'] ?? ''
  const cookies = parseCookies(cookieHeader)
  const sessionId = cookies[SESSION_COOKIE_NAME]

  if (!sessionId) {
    return yield* Effect.fail(
      new UnauthorizedError({ message: 'No session cookie' })
    )
  }

  const sessionStore = yield* SessionStore
  const session = yield* sessionStore
    .validate(sessionId)
    .pipe(
      Effect.mapError(
        () => new UnauthorizedError({ message: 'Invalid or expired session' })
      )
    )

  return {
    sessionId,
    accountAddress: session.accountAddress
  } satisfies AuthenticatedSession
})

export const AuthSessionLive = Layer.effect(
  AuthSession,
  requireAuth.pipe(Effect.catchAll((e) => Effect.die(e)))
)
