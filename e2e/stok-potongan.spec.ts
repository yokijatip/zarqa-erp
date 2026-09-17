import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe.configure({ mode: 'serial' });

async function waitForStokPotonganReady(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const bodyText = document.body.innerText.toLowerCase();
    const hasHeaderTable = bodyText.includes('model & detail potongan') && bodyText.includes('total tersedia');
    const hasEmptyState = bodyText.includes('belum ada stok potongan');
    const hasErrorState = bodyText.includes('gagal memuat data stok potongan');
    const hasRows = document.querySelectorAll('[class*="divide-y"] > div').length > 0;

    return hasHeaderTable || hasEmptyState || hasErrorState || hasRows;
  }, undefined, { timeout: 15_000 });
}

test.describe('Stok Potongan Kain', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
    await page.goto('/stok-potongan');
    await page.getByRole('heading', { name: /stok potongan kain/i }).waitFor({
      timeout: 15_000,
    });
    await waitForStokPotonganReady(page);
  });

  test('halaman stok potongan berhasil dimuat', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /stok potongan kain/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible();
    await expect(
      page.getByPlaceholder(/cari nama model/i),
    ).toBeVisible();
  });

  test('menampilkan tabel stok potongan atau empty state yang sesuai', async ({
    page,
  }) => {
    await waitForStokPotonganReady(page);

    const emptyState = page.getByText(/belum ada stok potongan/i);
    const errorState = page.getByText(/gagal memuat data stok potongan/i);
    const firstDataRow = page.locator('tbody tr').first();

    if (await errorState.isVisible().catch(() => false)) {
      throw new Error('Halaman stok potongan gagal memuat data dari Firebase.');
    }

    if (await emptyState.isVisible().catch(() => false)) {
      await expect(emptyState).toBeVisible();
      await expect(
        page.getByText(/stok akan muncul otomatis saat cutting selesai/i),
      ).toBeVisible();
      return;
    }

    await expect(page.getByText('Model & Detail Potongan', { exact: true })).toBeVisible();
    await expect(page.getByText('Total Tersedia', { exact: true })).toBeVisible();
    await expect(page.getByText('Masuk', { exact: true })).toBeVisible();
    await expect(page.getByText('Terpakai', { exact: true })).toBeVisible();
    await expect(page.getByText(/pcs$/i).first()).toBeVisible();
  });

  test('pencarian stok potongan bekerja untuk data hasil cutting', async ({
    page,
  }) => {
    await waitForStokPotonganReady(page);

    const searchInput = page.getByPlaceholder(/cari nama model/i);
    const errorState = page.getByText(/gagal memuat data stok potongan/i);
    const firstDataRow = page.locator('[class*="divide-y"] > div').first();

    if (await errorState.isVisible().catch(() => false)) {
      throw new Error('Halaman stok potongan gagal memuat data dari Firebase.');
    }

    if ((await page.locator('[class*="divide-y"] > div').count()) === 0) {
      await expect(page.getByText(/belum ada stok potongan/i)).toBeVisible();
      return;
    }

    const modelName = (await firstDataRow.locator('p').first().textContent())?.trim() ?? '';
    expect(modelName.length).toBeGreaterThan(0);

    await searchInput.fill(modelName.slice(0, Math.min(modelName.length, 5)));
    await expect(page.getByText(modelName, { exact: true })).toBeVisible();

    await searchInput.fill('zzztidakadahasil');
    await expect(page.getByText(/tidak ada hasil untuk/i)).toBeVisible();

    await searchInput.fill('');
    await expect(firstDataRow).toBeVisible();
  });
});
