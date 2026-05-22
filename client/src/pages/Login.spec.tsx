import { test, expect } from '@playwright/experimental-ct-react';
import { Login } from './Login';

test('Login page renders correctly', async ({ mount }) => {
  const component = await mount(<Login />);
  await expect(component.locator('h2')).toContainText('Login');
  await expect(component.locator('input[type="email"]')).toBeVisible();
  await expect(component.locator('input[type="password"]')).toBeVisible();
  await expect(component.locator('button[type="submit"]')).toBeVisible();
});

test('Login form requires email and password', async ({ mount, page }) => {
  const component = await mount(<Login />);
  await component.locator('button[type="submit"]').click();
  // Native HTML validation will block the form submission because of `required` attributes
});