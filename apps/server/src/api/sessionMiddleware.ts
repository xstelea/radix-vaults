import { Cookies, HttpServerRequest } from '@effect/platform'
import { SessionMiddleware, Unauthorized } from '@radix-vaults/shared'
import { Effect, Layer } from 'effect'
import { SessionStore } from '../auth/sessionStore'

const SESSION_COOKIE_NAME = 'radix_vault_session'

export const SessionMiddlewareLive = Layer.effect(
  SessionMiddleware,
  Effect.gen(function* () {
    const sessionStore = yield* SessionStore
    return Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const cookieHeader = request.headers['cookie'] ?? ''
      const cookies = Cookies.parseHeader(cookieHeader)
      const sessionId = cookies[SESSION_COOKIE_NAME]

      if (!sessionId) {
        return yield* new Unauthorized({ message: 'No session cookie' })
      }

      const session = yield* sessionStore
        .validate(sessionId)
        .pipe(
          Effect.mapError(
            () => new Unauthorized({ message: 'Invalid or expired session' })
          )
        )

      return { sessionId, accountAddress: session.accountAddress }
    })
  })
)
