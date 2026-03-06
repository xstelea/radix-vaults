import {
  RadixDappToolkit,
  DataRequestBuilder
} from '@radixdlt/radix-dapp-toolkit'
import { envVars } from './envVars'

const DAPP_DEFINITION_ADDRESS =
  import.meta.env.VITE_DAPP_DEFINITION_ADDRESS ??
  'account_tdx_2_12yf9gd53yfep7a669fv2t3wm7nz9zeezwd04n02a433ker8vza6rhe'

const NETWORK_ID = Number(import.meta.env.VITE_NETWORK_ID ?? '2')

let rdtInstance: ReturnType<typeof RadixDappToolkit> | null = null

export const getRadixDappToolkit = () => {
  if (rdtInstance) return rdtInstance

  rdtInstance = RadixDappToolkit({
    dAppDefinitionAddress: DAPP_DEFINITION_ADDRESS,
    networkId: NETWORK_ID
  })

  rdtInstance.walletApi.setRequestData(
    DataRequestBuilder.accounts().atLeast(1).withProof()
  )

  rdtInstance.walletApi.provideChallengeGenerator(async () => {
    const res = await fetch('/auth/challenge')
    const { challenge } = await res.json()
    return challenge
  })

  return rdtInstance
}

export const isVitestEnv =
  typeof import.meta.env.VITEST !== 'undefined' ||
  envVars.EFFECTIVE_ENV === 'dev'
