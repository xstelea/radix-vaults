import { Registry } from '@effect-atom/atom-react'
import type * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import { type ExternalToast, toast } from 'sonner'

type ToastVariant = {
  message: string | React.ReactNode
  type: 'success' | 'error' | 'info'
}

type ToastOptions<A, E, Args extends ReadonlyArray<unknown>> = {
  whenLoading:
    | string
    | React.ReactNode
    | ((args: {
        registry: Registry.Registry
        args: Args
      }) => React.ReactNode | string)
  whenSuccess:
    | string
    | React.ReactNode
    | ((args: {
        registry: Registry.Registry
        result: A
        args: Args
      }) => React.ReactNode | string | ToastVariant)
  whenFailure:
    | string
    | React.ReactNode
    | ((args: {
        registry: Registry.Registry
        cause: Cause.Cause<E>
        args: Args
      }) => Option.Option<React.ReactNode | string>)
  options?: Omit<ExternalToast, 'id'>
}

export const withToast =
  <A, E, Args extends ReadonlyArray<unknown>, R>(
    options: ToastOptions<A, E, Args>
  ) =>
  (self: Effect.Effect<A, E, R>, ...args: Args) =>
    Effect.gen(function* () {
      const registry = yield* Registry.AtomRegistry
      const toastId = toast.loading(
        typeof options.whenLoading === 'function'
          ? options.whenLoading({ registry, args })
          : options.whenLoading,
        options.options
      )

      const result = yield* self.pipe(
        Effect.tapErrorCause((cause) =>
          Effect.sync(() => {
            const message =
              typeof options.whenFailure === 'function'
                ? options.whenFailure({ registry, cause, args })
                : options.whenFailure

            if (Option.isOption(message) && message._tag === 'None') {
              return toast.dismiss(toastId)
            }

            toast.error(Option.isOption(message) ? message.value : message, {
              id: toastId,
              ...options.options
            })
          })
        )
      )

      const successResult =
        typeof options.whenSuccess === 'function'
          ? options.whenSuccess({ registry, result, args })
          : options.whenSuccess

      if (
        typeof successResult === 'object' &&
        successResult !== null &&
        'type' in successResult &&
        'message' in successResult
      ) {
        const variant = successResult as ToastVariant
        const toastFn =
          variant.type === 'success'
            ? toast.success
            : variant.type === 'error'
              ? toast.error
              : toast.info
        toastFn(variant.message, { id: toastId, ...options.options })
      } else {
        toast.success(successResult, { id: toastId, ...options.options })
      }
      return result
    })
