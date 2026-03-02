import { test, expect } from '@playwright/test';

/**
 * Auth Guard Tests
 * Memastikan redirect login/dashboard berjalan benar.
 */

test.describe('Auth Guard', () => {
  test('halaman root redirect ke /login saat belum login', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('halaman /dashboard redirect ke /login saat belum login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('halaman /login tampil dengan form email & password', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('login dengan kredensial salah tampil error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'salah@example.com');
    await page.fill('input[type="password"]', 'passwordsalah');
    await page.click('button[type="submit"]');

    // Tunggu error message muncul (max 8 detik untuk Firebase response)
    await expect(page.locator('text=/gagal|salah|invalid|error/i')).toBeVisible({
      timeout: 8_000,
    });
  });
});
