import type { Page } from '@playwright/test';

/**
 * Login helper — baca kredensial dari environment variable.
 *
 * Set sebelum jalankan test:
 *   Windows (PowerShell):
 *     $env:TEST_EMAIL="email@kamu.com"; $env:TEST_PASSWORD="passwordkamu"
 *
 *   Atau buat file .env.test (lihat .env.test.example)
 */
export async function loginAs(page: Page): Promise<void> {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'TEST_EMAIL dan TEST_PASSWORD harus di-set.\n' +
        'Contoh: $env:TEST_EMAIL="email@kamu.com"; $env:TEST_PASSWORD="pass"',
    );
  }

  await page.goto('/login');
  await page.waitForURL('**/login');

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Tunggu redirect ke dashboard setelah login berhasil
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}
