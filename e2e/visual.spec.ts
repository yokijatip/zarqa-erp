import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

/**
 * Visual / Screenshot Tests
 *
 * Cara pakai:
 *   npm run test:visual:update   ← buat snapshot baseline pertama kali
 *   npm run test:visual          ← bandingkan dengan baseline
 *
 * Snapshot disimpan di: e2e/__snapshots__/
 */

// Ganti networkidle (tidak bisa karena Firebase terus request)
// dengan tunggu elemen spesifik yang menandakan halaman sudah siap
async function waitForPageReady(page: import('@playwright/test').Page, selector: string) {
  await page.locator(selector).waitFor({ state: 'visible', timeout: 15_000 });
  // Beri waktu animasi & render selesai
  await page.waitForTimeout(500);
}

test.describe('Visual — Login', () => {
  test('halaman login', async ({ page }) => {
    await page.goto('/login');
    await waitForPageReady(page, 'input[type="email"]');
    await expect(page).toHaveScreenshot('login.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});

test.describe('Visual — Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
    // Tunggu timestamp "Diperbarui" — tanda data Firebase sudah masuk
    await page.locator('text=/Diperbarui:/i').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(500);
  });

  test('dashboard utama (full page)', async ({ page }) => {
    await expect(page).toHaveScreenshot('dashboard-full.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('dashboard — KPI cards', async ({ page }) => {
    const kpiSection = page.locator('.grid').first();
    await expect(kpiSection).toHaveScreenshot('dashboard-kpi.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});

test.describe('Visual — Halaman lain', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('halaman stok kain', async ({ page }) => {
    await page.goto('/stok-kain');
    // Tunggu heading halaman tampil, bukan networkidle
    await waitForPageReady(page, 'h1:has-text("Stok Kain")');
    await expect(page).toHaveScreenshot('stok-kain.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('halaman barang jadi', async ({ page }) => {
    await page.goto('/barang-jadi');
    await waitForPageReady(page, 'h1:has-text("Barang Jadi")');
    await expect(page).toHaveScreenshot('barang-jadi.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
