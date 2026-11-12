import { e2eEmail, expect, test } from './fixtures'

test('sign up, sign out, and sign back in', async ({ page, consoleErrors }) => {
  const email = e2eEmail()

  await page.goto('/signup')
  await page.getByPlaceholder('Full Name').fill('Ada Lovelace')
  await page.getByPlaceholder('Email Address').fill(email)
  await page.getByPlaceholder('Phone Number').fill('7700900000')
  await page.getByPlaceholder('Password', { exact: true }).fill('Testing123')
  await page.getByPlaceholder('Confirm Password').fill('Testing123')
  await page.getByRole('button', { name: 'Create Account' }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Welcome back, Ada!' })).toBeVisible()

  await page.getByRole('button', { name: /log ?out/i }).click()
  await expect(page).toHaveURL(/\/$|\/login$/)

  await page.goto('/login')
  await page.getByPlaceholder('Email Address').fill(email)
  await page.getByPlaceholder('Password').fill('Wrong1234')
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.')

  await page.getByPlaceholder('Password').fill('Testing123')
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // A wrong password is an expected 401, logged by the browser; nothing else.
  expect(consoleErrors.filter((e) => !/401/.test(e))).toEqual([])
})

test('signed-out visitors are sent to the login page', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
})
