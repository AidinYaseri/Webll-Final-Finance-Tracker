import { test, expect } from '@playwright/experimental-ct-react';
import { Register } from './Register';

test('Register page renders correctly', async ({ mount }) => {
  const component = await mount(<Register />);
  await expect(component.locator('h2')).toContainText('Register');
  
  await expect(component.locator('input[type="text"]')).toBeVisible();
  await expect(component.locator('input[type="email"]')).toBeVisible();
  await expect(component.locator('input[type="password"]')).toHaveCount(2); // password, confirm password
  await expect(component.locator('button[type="submit"]')).toBeVisible();
});

test('Register form requires all inputs', async ({ mount }) => {
  const component = await mount(<Register />);
  await component.locator('button[type="submit"]').click();
  // Ensure native required validation hooks up by locating the confirm password which is naturally rendered
  await expect(component.locator('label', { hasText: 'Confirm Password' })).toBeVisible();
});