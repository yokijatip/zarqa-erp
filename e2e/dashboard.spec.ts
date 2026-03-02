import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

/**
 * Dashboard E2E Tests
 */

test.describe('Dashboard Utama', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
    // Tunggu heading utama muncul sebelum lanjut ke assertion
    await page.getByRole('heading', { name: /dashboard utama/i }).waitFor({ timeout: 10_000 });
  });

  test('halaman dashboard berhasil dimuat', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /dashboard utama/i })).toBeVisible();
    // URL harus di /dashboard
    expect(page.url()).toContain('/dashboard');
  });

  test('tombol Refresh tersedia dan bisa diklik', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i });
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    // Tombol berubah jadi "Memuat..." lalu kembali "Refresh"
    await expect(refreshBtn).toHaveText(/refresh/i, { timeout: 15_000 });
  });

  test('timestamp "Diperbarui" muncul setelah data dimuat', async ({ page }) => {
    await expect(page.locator('text=/Diperbarui:/i')).toBeVisible({ timeout: 15_000 });
  });

  test('KPI cards tampil: Batch Aktif, Stok Barang Jadi, Stok Kain, Keluar', async ({ page }) => {
    // Tunggu data selesai dimuat
    await page.locator('text=/Diperbarui:/i').waitFor({ timeout: 15_000 });

    // Gunakan selector spesifik ke elemen KPI (uppercase label di card)
    await expect(page.locator('.uppercase:has-text("Batch Aktif")').first()).toBeVisible();
    await expect(page.locator('.uppercase:has-text("Stok Barang Jadi")').first()).toBeVisible();
    await expect(page.locator('.uppercase:has-text("Stok Kain")').first()).toBeVisible();
    await expect(page.locator('.uppercase:has-text("Keluar")').first()).toBeVisible();
  });

  test('filter periode bisa diubah ke "7 Hari"', async ({ page }) => {
    const btn7h = page.locator('button', { hasText: '7 Hari' });
    await expect(btn7h).toBeVisible();

    // Pastikan tombol ini awalnya tidak aktif (punya class border inactive)
    await expect(btn7h).toHaveClass(/border border-gray-200/);

    await btn7h.click();

    // Setelah klik, tombol aktif — tidak lagi punya class border inactive
    await expect(btn7h).not.toHaveClass(/border border-gray-200/, { timeout: 3_000 });
  });

  test('sidebar navigasi: link Dashboard dan Order Produksi ada', async ({ page }) => {
    // Dashboard link selalu visible di sidebar (top-level item)
    await expect(page.locator('a[href="/dashboard"]').first()).toBeVisible();

    // Link "Lihat semua →" di section Produksi Berjalan (bukan sidebar yang collapsed)
    await expect(
      page.locator('a[href="/order-produksi"]').filter({ hasText: /lihat/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
