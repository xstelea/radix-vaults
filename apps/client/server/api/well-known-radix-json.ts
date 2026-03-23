import { defineEventHandler } from 'nitro/h3'

export default defineEventHandler(() => ({
  dApps: [
    {
      dAppDefinitionAddress:
        process.env.VITE_DAPP_DEFINITION_ADDRESS ??
        'account_tdx_2_12yf9gd53yfep7a669fv2t3wm7nz9zeezwd04n02a433ker8vza6rhe'
    }
  ]
}))
