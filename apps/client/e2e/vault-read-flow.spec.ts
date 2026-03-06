import { expect, test } from '@playwright/test'

test('dashboard list and vault detail read flow works', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Vault Dashboard' })
  ).toBeVisible()

  const alphaVault = page.getByRole('link', { name: /Alpha Vault/i })
  await expect(alphaVault).toBeVisible()
  await expect(alphaVault).toContainText('1 pending')

  await alphaVault.click()

  await expect(page).toHaveURL(/\/vaults\/account_tdx_2_1qalpha$/)
  await expect(page.getByRole('heading', { name: 'Alpha Vault' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Current Signers' })
  ).toBeVisible()
})
