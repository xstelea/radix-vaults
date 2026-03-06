import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 7_000
  },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry'
  },
  webServer: [
    {
      command:
        'pnpm --dir ../.. dev:db && pnpm --dir ../.. --filter @radix-vaults/server dev',
      url: 'http://localhost:3001/health',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NETWORK_ID: process.env.NETWORK_ID ?? '2',
        DAPP_DEFINITION_ADDRESS:
          process.env.DAPP_DEFINITION_ADDRESS ??
          'account_tdx_2_12yf9gd53yfep7a669fv2t3wm7nz9zeezwd04n02a433ker8vza6rhe',
        EXPECTED_ORIGIN: process.env.EXPECTED_ORIGIN ?? 'http://localhost:3000',
        TEAM_MEMBER_BADGE_ADDRESS:
          process.env.TEAM_MEMBER_BADGE_ADDRESS ??
          'resource_tdx_2_1t5gxap3kmagagqmu7hkde5j8nf0c83frwqhfqs35k2pys4c7g8kn6'
      }
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
