import {
  DataRequestBuilder,
  RadixDappToolkit as RadixDappToolkitFactory,
  Logger
} from '@radixdlt/radix-dapp-toolkit'
import { Context, Effect, Layer, Ref } from 'effect'
import { AppApiClient } from '@/lib/apiClient'
import { envVars } from '@/lib/envVars'

const NETWORK_ID = Number(import.meta.env.VITE_NETWORK_ID ?? '2')

export class RadixDappToolkit extends Context.Tag('RadixDappToolkit')<
  RadixDappToolkit,
  Ref.Ref<RadixDappToolkitFactory>
>() {
  static Live = Layer.scoped(
    this,
    Effect.gen(function* () {
      if (typeof window === 'undefined') {
        return RadixDappToolkit.of(
          yield* Ref.make(null as unknown as RadixDappToolkitFactory)
        )
      }

      const rdt = RadixDappToolkitFactory({
        networkId: NETWORK_ID,
        dAppDefinitionAddress: envVars.DAPP_DEFINITION_ADDRESS,
        logger: Logger()
      })

      rdt.walletApi.setRequestData(
        DataRequestBuilder.accounts().exactly(1).withProof()
      )

      const client = yield* AppApiClient
      rdt.walletApi.provideChallengeGenerator(() =>
        Effect.runPromise(
          client.auth.createChallenge().pipe(Effect.map((r) => r.challenge))
        )
      )

      yield* Effect.addFinalizer(() => Effect.sync(() => rdt.destroy()))

      return RadixDappToolkit.of(yield* Ref.make(rdt))
    })
  )
}
